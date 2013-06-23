var Q = require("q");
var couchdb = require("felix-couchdb");
var util = require("util");

module.exports = qcouch = function(config){
  var self = this, clientinit = Q.defer(), dbinit = Q.defer(), designinit = Q.defer();

  this.databasename = config.databasename;
  this.designs = config.designs || {};
  this.host = config.host || "localhost";
  this.port = config.port || 5984;
  
  this.fromDB = config.fromDB;
  this.toDB = config.toDB;
  
  if (typeof(this.databasename)!=="string" || !this.databasename.length)
    throw "Config must include a databasename property";

  this.client = couchdb.createClient(this.port,this.host);
  this.db = this.client.db(this.databasename);
  this.clientinitialized = clientinit.promise;
  this.dbinitialized = dbinit.promise;
  this.designsinitialized = designinit.promise;

  Q.npost(this.client,"allDbs").then(function(arr){
    clientinit.resolve(true);
    return self.exists();
  },function(err){
    clientinit.reject(err);
    dbinit.reject(err);
    designinit.reject(err);

    //throw err;
  }).then(function(exists){
    if (!exists){
      util.puts("DB ["+self.databasename+"] does not exist - creating now");
      return self.create();
    }
    else{
      util.puts("DB ["+self.databasename+"] exists");
      return true;
    }
  }).then(function(){
    dbinit.resolve(true);

    return self.updateDesigns();
  },function(err){
    dbinit.reject(err);
    designinit.reject(err);

    //throw err;
  }).done(function(){
    designinit.resolve(true);
  },function(err){
    designinit.reject(err);

    //throw err;
  });
}

for (var k in couchdb.Db.prototype){
  qcouch.prototype[k] = eval("(function(){ return this.couchMethod('"+k+"',Array.prototype.slice.call(arguments)); })",{});
}

qcouch.prototype.couchMethod = function(id,args){
  var self = this;

  if (["exists","create","info"].indexOf(id)>-1){
    // these functions don't need the database to exist
    args.unshift(this.clientinitialized);
  }
  else if (["view"].indexOf(id)===-1){
    // all functions except the ones listed only need the db to exist
    args.unshift(this.dbinitialized);
  }
  else {
    args.unshift(this.designsinitialized);
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
            if (args[0] && args[0].docs && util.isArray(args[0].docs)){
              for (var i=0, ii=args[0].docs.length; i<ii; i++)
                args[0].docs[i] = self.toDB(args[0].docs[i]);
            }
            break;
        }
      }
      
      if (id==="getDoc" && self.fromDB){
        args.push(function(){
          var args = Array.prototype.slice.call(arguments), err = args.shift();
  
          if (err)
            deferred.reject(err);
          
          deferred.resolve(self.fromDB(args[0]));
        });
      }
      else{
        args.push(function(){
          var args = Array.prototype.slice.call(arguments), err = args.shift();
  
          if (err)
            deferred.reject(err);
          
          deferred.resolve(args[0]);
        });
      }

      self.db[id].apply(self.db,args);
    }
    else{
      deferred.resolve(this.db[id].apply(this.db,args));
    }

    return deferred.promise;
  });
};

qcouch.prototype.updateDesigns = function(){
  var updates = [];

  for (var k in this.designs)
    updates.push(this.updateDesign(k));

  return Q.all(updates);
};

qcouch.prototype.updateDesign = function(designname){
  var self = this;

  this[designname] = {};
  for (var k in this.designs[designname]){
    this[designname][k] = eval("(function(query){return this.runView('"+designname+"','"+k+"',query); })",{});
  }

  return this.dbinitialized.then(function(){
    var deferred = Q.defer();

    util.puts("Checking design document ["+designname+"]");

    self.db.getDoc("_design/"+designname,function(err,olddoc){
      if (err && err.error && err.error==="not_found"){
        util.puts("Design document ["+designname+"] doesn't exist - creating");
        deferred.resolve(self.saveDoc("_design/"+designname,self.designs[designname]).then(function(){
          util.puts("Design document ["+designname+"] created");
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
        util.puts("Design document ["+designname+"] needs to be updated");
        deferred.resolve(self.saveDoc(self.designs[designname]).then(function(){
          util.puts("Design document ["+designname+"] updated");
        }));
      }
      else{
        util.puts("Design document ["+designname+"] is already up to date");
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
    throw "View resolveto property must be one of [auto|objects|keys]";
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