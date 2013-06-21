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
            emit(null, null);
          }
        }
      }
    }
  }
});

Q.all([ newdb.clientinitialized, newdb.dbinitialized, newdb.designsinitialized ]).then(function(){
  var newdb2 = new qcouch({
    databasename:dbname,
    designs:{
      test: {
        views: {
          changed: {
            map: function(doc) {
              emit(null, null);
            }
          }
        }
      }
    }
  });

  Q.all([ newdb.clientinitialized, newdb.dbinitialized, newdb.designsinitialized ]).then(function(){
    console.log("all is well");
  }).done();
}).done();