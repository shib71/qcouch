var couchdb = require("felix-couchdb");
var qcouch = require("./index");
var Q = require("q");

var client = couchdb.createClient(5984,"localhost"), dbname = "qcouchtest_"+Math.floor(Math.random()*10000);

var newdb = new qcouch({
  databasename:dbname,
  designs:{
    test: {
      views: {
        all: {
          map: function(doc) {
            emit(doc._id, null);
          }
        }
      }
    }
  }
});

Q.all([ newdb.clientinitialized, newdb.dbinitialized, newdb.designsinitialized ]).then(function(){
  return newdb.saveDoc({ abc:123, def:"hello world" }).then(function(){
    newdb.runView("test","all",{ resolveto:"keys" }).then(function(data){
      console.log("keys",arguments);
    }).done();
    
    newdb.runView("test","all",{ resolveto:"objects" }).then(function(data){
      console.log("objects",arguments);
    }).done();
  });
}).done();