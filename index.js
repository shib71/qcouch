var Q = require("q");
var couchdb = require("felix-couchdb");
var util = require("util");

module.exports = qcouch = function(config){
  if (typeof(config.databasename)!=="string" || !config.databasename.length)
    throw new Error((this.name ? "["+this.name+"] " : "") + "Config must include a databasename property");
  

  this.name = config.name;
  this.debug = config.debug;

  // set up client
  this.host = config.host || "localhost";
  this.port = config.port || 5984;
  this.client = couchdb.createClient(this.port,this.host);

  // set up db
  this.databasename = config.databasename;

  // set up designs
  this.designs = config.designs || {};
  
  this.fromDB = config.fromDB;
  this.toDB = config.toDB;
}

Object.defineProperty(qcouch.prototype,"client",{
  get : function(){
    return this._client;
  },
  set : function(v){
    this._client = v;

    this.initClient();
  }
});

qcouch.prototype.initClient = function(){
  var clientinit = Q.defer(), self = this;

  this.clientinit = clientinit.promise;

  Q.npost(this.client,"allDbs").then(function(arr){
    if (self.debug)
      util.puts((self.name ? "["+self.name+"] " : "") + "Client is available");

    clientinit.resolve(true);
  },function(err){
    if (self.debug)
      util.puts((self.name ? "["+self.name+"] " : "") + "Client is not available - " + err.toString());

    clientinit.reject(err);
  }).done();
}

Object.defineProperty(qcouch.prototype,"clientinit",{
  get : function(){
    return this._clientinit;
  },
  set : function(v){
    this._clientinit = v;
    
    this.initDB();
  }
});

Object.defineProperty(qcouch.prototype,"databasename",{
  get : function(){
    return this._databasename;
  },
  set : function(v){
    this._databasename = v;

    this.initDB();
  }
})

qcouch.prototype.initDB = function(){
  if (this.client===undefined || this.clientinit===undefined || this.databasename===undefined)
    return;


  var dbinit = Q.defer(), self = this;

  this.dbinit = dbinit.promise;
  this.db = null;

  this.clientinit.then(function(){
    self.db = self.client.db(self.databasename);

    return self.exists();
  },function(err){
    // if client was rejected, reject db
    dbinit.reject(err);
  }).then(function(exists){
    if (!exists){
      if (self.debug)
        util.puts((self.name ? "["+self.name+"] " : "") + "DB ["+self.databasename+"] does not exist - creating now");

      return self.create();
    }
    else{
      if (self.debug)
        util.puts((self.name ? "["+self.name+"] " : "") + "DB ["+self.databasename+"] exists");

      return true;
    }
  }).then(function(){
    if (self.debug)
      util.puts((self.name ? "["+self.name+"] " : "") + "DB ["+self.databasename+"] is available");

    dbinit.resolve(true);
  },function(err){
    if (self.debug)
      util.puts((self.name ? "["+self.name+"] " : "") + "DB ["+self.databasename+"] is not available - " + err.toString());

    dbinit.reject(err);
  }).done();
}

Object.defineProperty(qcouch.prototype,"dbinit",{
  get : function(){
    return this._dbinit;
  },
  set : function(v){
    this._dbinit = v;

    this.initDesign();
  }
});

Object.defineProperty(qcouch.prototype,"designs",{
  get : function(){
    return this._designs;
  },
  set : function(v){
    this._designs = v;

    this.initDesign();
  }
});

qcouch.prototype.initDesign = function(){
  if (this.dbinit===undefined || this.designs===undefined)
    return;


  var designinit = Q.defer(), self = this;

  this.designinit = designinit.promise;

  this.dbinit.then(function(){
    if (self.designs==={} || self.designs===undefined)
      return true;
    else
      return self.updateDesigns();
  }).then(function(){
    if (self.debug)
      util.puts((self.name ? "["+self.name+"] " : "") + "Designs are up to date");

    designinit.resolve(true);
  },function(err){
    if (self.debug)
      util.puts((self.name ? "["+self.name+"] " : "") + "Designs could not be updated - " + err.toString());

    designinit.reject(err);
  }).done();

  // auto calculated functions
  for (var designname in this.designs){
    if (this.designs[designname].views){
      this[designname] = {};
      for (var k in this.designs[designname].views){
        this[designname][k] = eval("(function(query){return this.runView('"+designname+"','"+k+"',query); })",{});
      }
    }
  };
}

Object.defineProperty(qcouch.prototype,"designinit",{
  get : function(){
    return this._designinit;
  },
  set : function(v){
    var self = this;

    this._designinit = v;
  }
});

for (var k in couchdb.Db.prototype){
  qcouch.prototype[k] = eval("(function(){ return this.couchMethod('"+k+"',Array.prototype.slice.call(arguments)); })",{});
}

qcouch.prototype.couchMethod = function(id,args){
  var self = this;

  if (["exists","create","info"].indexOf(id)>-1){
    // these functions don't need the database to exist
    args.unshift(this.clientinit);
  }
  else if (["view"].indexOf(id)===-1){
    // these functions don't need the views to be up to date
    args.unshift(this.dbinit);
  }
  else {
    // these functions need views
    args.unshift(this.designinit);
  }
  
  return Q.all(args).then(function(args){
    var deferred = Q.defer(), allow = args.shift();
    
    if (["changesStream"].indexOf(id)===-1){
      // if this database has a `toDB` function, use it to prepare saved docs
      if (self.toDB){
        switch (id){
          case "saveDoc":
            if (typeof(args[0])==="object")
              args[0] = self.toDB(args[0]);
            else if (typeof(args[1])==="object")
              args[1] = self.toDB(args[1]);
            break;
          case "bulkDocs":
            if (args[0] && args[0].docs && util.isArray(args[0].docs))
              args[0].docs = args[0].docs.map(self.toDB);
            break;
        }
      }
      
      args.push(function(err,result){
        if (err)
          deferred.reject(new Error(err.reason));
        else if (id==="getDoc" && self.fromDB)
          deferred.resolve(self.fromDB(result));
        else
          deferred.resolve(result);
      });
      
      self.db[id].apply(self.db,args);
    }
    else{
      deferred.resolve(this.db[id].apply(this.db,args));
    }

    return deferred.promise;
  });
};

qcouch.prototype.updateDesigns = function(designs){
  var updates = [];

  for (var k in designs)
    this.designs[k] = designs[k];

  for (var k in this.designs)
    updates.push(this.updateDesign(k));

  return Q.all(updates);
};

qcouch.prototype.updateDesign = function(designname){
  var self = this;
  
  return this.dbinit.then(function(){
    var deferred = Q.defer(), designid = self.designs[designname]._id || "_design/"+designname;
    
    util.puts((self.name ? "["+self.name+"] " : "") + "Checking design document ["+designname+"]");
    
    self.db.getDoc(designid,function(err,olddoc){
      if (err && err.error && err.error==="not_found"){
        util.puts((self.name ? "["+self.name+"] " : "") + "Design document ["+designname+"] doesn't exist - creating");
        deferred.resolve(self.saveDoc(designid,self.designs[designname]).then(function(){
          util.puts((self.name ? "["+self.name+"] " : "") + "Design document ["+designname+"] created");
        }));
        return;
      }
      else if (err && err.error){
        throw err.error + ": " + err.reason;
      }

      var isdiff = false;

      for (var k in self.designs[designname])
        isdiff = isdiff || (couchdb.toJSON(self.designs[designname][k]) !== couchdb.toJSON(olddoc[k]));

      if (isdiff){
        self.designs[designname]._id = olddoc._id;
        self.designs[designname]._rev = olddoc._rev;
        util.puts((self.name ? "["+self.name+"] " : "") + "Design document ["+designname+"] needs to be updated");
        deferred.resolve(self.saveDoc(self.designs[designname]).then(function(){
          util.puts((self.name ? "["+self.name+"] " : "") + "Design document ["+designname+"] updated");
        }));
      }
      else{
        util.puts((self.name ? "["+self.name+"] " : "") + "Design document ["+designname+"] is already up to date");
        deferred.resolve(true);
      }
    });

    return deferred.promise;
  });
}

qcouch.prototype.runView = function(design,view,query){
  var self = this, promise = "", resolution = "";
  
  if (design==="allDocs"){
    query = view;
    view = design;
    design = undefined;
  }
  
  query = query || {};

  if (query.resolveto && !["auto","objects","keys"].indexOf(query.resolve)===-1)
    throw new Error((this.name ? "["+this.name+"] " : "") + "View resolveto property must be one of [auto|objects|keys]");
  else {
    resolution = query.resolveto || "auto";
    delete query.resolveto;
  }

  // resolve => return simple array of docs
  if (resolution === "objects"){
    query.include_docs = true;
  }

  // if there is a limit, get an extra row for pagination info
  if (query.limit)
    query.limit += 1;

  // run view, convert couch error to JavaScript error
  if (design===undefined && view==="allDocs"){
    promise = self.allDocs(query)
  }
  else{
    promise = self.view(design,view,query)
  }
  
  // check for errors in result
  promise = promise.then(function(result){
    if (result.error)
      throw new Error(result.reason);
    else
      return result;
  });

  // to resolve, extract map data.rows[n].doc
  switch (resolution){
    case "objects":
      promise = promise.then(function(data){
        var newresult = data.rows.map(function(o){
          return self.fromDB ? self.fromDB(o.doc) : o.doc;
        }), next = {};
        
        if (newresult.length && query.limit && data.rows.length == query.limit){
          next.startkey = data.rows[data.rows.length-1].key;
          next.startkey_docid = data.rows[data.rows.length-1].id;
          
          newresult = newresult.slice(0,query.limit-1);
          
          Object.defineProperty(newresult,"next_startkey",{ value:next.startkey, enumerable:false });
          Object.defineProperty(newresult,"next_startkey_docid",{ value:next.startkey_docid, enumerable:false });
        }
        
        if (newresult.length){
          Object.defineProperty(newresult,"startkey",{ value:data.rows[0].key, enumerable:false });
          Object.defineProperty(newresult,"startkey_docid",{ value:data.rows[0].id, enumerable:false });
        }
        
        return newresult;
      });
      break;
    case "keys":
      promise = promise.then(function(data){
        var newresult = data.rows.map(function(o){
          return o.key;
        }), next = {};

        if (newresult.length && query.limit && data.rows.length == query.limit){
          next.startkey = data.rows[data.rows.length-1].key;
          next.startkey_docid = data.rows[data.rows.length-1].id;
          
          newresult = newresult.slice(0,query.limit-1);
          
          Object.defineProperty(newresult,"next_startkey",{ value:next.startkey, enumerable:false });
          Object.defineProperty(newresult,"next_startkey_docid",{ value:next.startkey_docid, enumerable:false });
        }
        
        if (newresult.length){
          Object.defineProperty(newresult,"startkey",{ value:data.rows[0].key, enumerable:false });
          Object.defineProperty(newresult,"startkey_docid",{ value:data.rows[0].id, enumerable:false });
        }
        
        return newresult;
      });
      break;
  }

  return promise;
}