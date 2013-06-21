var test = require("tap").test;
var couchdb = require("felix-couchdb");
var qcouch = require("../index");
var Q = require("q");

test("invalid couch server",function(t){
  t.plan(1);

  var newdb = new qcouch({
    databasename:"abc",
    port: 9876
  });

  newdb.clientinitialized.then(function(){
    t.fail("client should not be initialized");
  },function(err){
    t.ok("client could not be initialized");
  });
});

test("initialize new database",function(t){
  t.plan(3);

  var client = couchdb.createClient(5984,"localhost"), dbname = "qcouchtest_"+Math.floor(Math.random()*1000000);

  var newdb = new qcouch({
    databasename:dbname
  });

  Q.all([ newdb.clientinitialized, newdb.dbinitialized, newdb.designsinitialized ]).then(function(){
    var db = client.db(dbname);

    db.exists(function(err,exists){
      t.equal(err,null,"exists did not error");
      t.equal(exists,true,"qcouch created missing database");

      db.remove(function(){
        t.ok("test database removed");
      });
    });
  }).done();
});

test("initialize new database with a design",function(t){
  t.plan(7);

  var client = couchdb.createClient(5984,"localhost"), dbname = "qcouchtest_"+Math.floor(Math.random()*1000000);

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
    var db = client.db(dbname);

    db.exists(function(err,exists){
      t.equal(err,null,"exists did not error");
      t.equal(exists,true,"qcouch created missing database");

      db.view("test","all",function(err,result){
        t.equal(err,null,"view result did not error");
        t.equal(typeof(result),"object","view returned results");
        t.inequal(result.rows,undefined,"view returned rows");
        t.equal(result.rows.constructor,Array,"view result rows are an array");

        db.remove(function(){
          t.ok("test database removed");
        });
      });
    });
  }).done();
});

test("initialize existing database with a changed design",function(t){
  t.plan(8);

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

    Q.all([ newdb2.clientinitialized, newdb2.dbinitialized, newdb2.designsinitialized ]).then(function(){
      var db = client.db(dbname);

      db.exists(function(err,exists){
        var def = Q.defer();

        t.equal(err,null,"exists did not error");
        t.equal(exists,true,"qcouch created missing database");

        db.view("test","all",function(err,result){
          t.inequal(err,null,"old view returned error");
          t.inequal(typeof(result),"object","old view did not return results");

          def.resolve("done");
        });

        db.view("test","changed",function(err,result){
          if (err)
            throw err;

          t.equal(typeof(result),"object","new view returned results");
          t.inequal(result.rows,undefined,"new view returned rows");
          t.equal(result.rows.constructor,Array,"new view result rows are an array");

          def.resolve("done");
        });

        def.promise.then(function(){
          db.remove(function(){
            t.ok("test database removed");
          });
        });
      });
    }).done();
  }).done();
});

test("initialize existing database with a new design",function(t){
  t.plan(9);

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
            all: {
              map: function(doc) {
                emit(null, null);
              }
            }
          }
        },
        test2: {
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

    Q.all([ newdb2.clientinitialized, newdb2.dbinitialized, newdb2.designsinitialized ]).then(function(){
      var db = client.db(dbname);

      db.exists(function(err,exists){
        var def = Q.defer();

        t.equal(err,null,"exists did not error");
        t.equal(exists,true,"qcouch created missing database");

        db.view("test","all",function(err,result){
          if (err)
            throw err;

          t.equal(typeof(result),"object","new view returned results");
          t.inequal(result.rows,undefined,"new view returned rows");
          t.equal(result.rows.constructor,Array,"new view result rows are an array");

          def.resolve("done");
        });

        db.view("test2","all",function(err,result){
          if (err)
            throw err;

          t.equal(typeof(result),"object","new view returned results");
          t.inequal(result.rows,undefined,"new view returned rows");
          t.equal(result.rows.constructor,Array,"new view result rows are an array");

          def.resolve("done");
        });

        def.promise.then(function(){
          db.remove(function(){
            t.ok("test database removed");
          });
        });
      });
    }).done();
  }).done();
});

test("saveDoc",function(t){
  t.plan(10);

  var client = couchdb.createClient(5984,"localhost"), dbname = "qcouchtest_"+Math.floor(Math.random()*1000000);

  var newdb = new qcouch({
    databasename:dbname
  });

  newdb.saveDoc({ abc:123, def:"hello world" }).then(function(doc){
    var db = client.db(dbname);

    t.equal(typeof(doc),"object","saveDoc result resolved object");
    t.equal(doc.ok,true,"result doc has ok=true");
    t.equal(typeof(doc.id),"string","result doc has id");
    t.equal(typeof(doc.rev),"string","result doc has rev");

    db.getDoc(doc.id,function(err,doc){
      if (err)
        throw err.error;

      t.equal(typeof(doc),"object","getDoc returned saved doc");
      t.equal(typeof(doc._id),"string","returned doc has _id");
      t.equal(typeof(doc._rev),"string","returned doc has _rev");
      t.equal(doc.abc,123,"returned doc has abc=123");
      t.equal(doc.def,"hello world","returned doc has def='hello world'");

      db.remove(function(){
        t.ok("test database removed");
      });
    });
  }).done();
});

test("getDoc",function(t){
  t.plan(5);

  var client = couchdb.createClient(5984,"localhost"), dbname = "qcouchtest_"+Math.floor(Math.random()*1000000);
  var db = client.db(dbname);

  var newdb = new qcouch({
    databasename:dbname
  });

  Q.all([ newdb.clientinitialized, newdb.dbinitialized, newdb.designsinitialized ]).then(function(){
    db.saveDoc({ abc:123, def:"hello world" },function(err,doc){
      if (err)
        throw err.error;

      newdb.getDoc(doc.id).then(function(doc){
        t.equal(typeof(doc),"object","getDoc returned saved doc");
        t.equal(typeof(doc._id),"string","returned doc has _id");
        t.equal(typeof(doc._rev),"string","returned doc has _rev");
        t.equal(doc.abc,123,"returned doc has abc=123");
        t.equal(doc.def,"hello world","returned doc has def='hello world'");

        db.remove(function(){
          t.ok("test database removed");
        });
      }).done();
    });
  }).done();
});

test("basic view",function(t){
  t.plan(7);

  var client = couchdb.createClient(5984,"localhost"), dbname = "qcouchtest_"+Math.floor(Math.random()*1000000);

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
    var db = client.db(dbname);

    db.saveDoc({ abc:123, def:"hello world" },function(err,doc){
      if (err)
        throw err.error;

      newdb.runView("test","all").then(function(data){
        t.equal(typeof(data),"object","runView returned standard object");
        t.equal(data.total_rows,1,"runView results included total_rows");
        t.equal(data.offset,0,"runView results included offset");
        t.inequal(data.rows,undefined,"runView results included rows");
        t.equal(data.rows.length,1,"runView results included a document");
        t.equal(data.rows[0].id,doc.id,"runView included saved doc in result");

        db.remove(function(){
          t.ok("test database removed");
        });
      }).done();
    });
  }).done();
});

// view - resolve to objects


// view - resolve to keys


// view - pagination