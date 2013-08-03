The basic premise of QCouch is felix-couchdb + Q, and the most basic use case is:

    db = new qcouch({ databasename:"mydb" });
    db.getDoc("mydocid").then(function(doc){
      // your stuff here
    });

This makes it easier to work with parrallel and sequential couchdb requests without 
needing crazy callbacks.

But since I was writing a wrapper, I decided to add some other functionality I find 
useful.

## Database Intialization

If database doesn't exist, qcouch will automatically attempt to create it.

## Design Intialization and Updating

If the specified designs don't exist, qcouch will automatically add them; if they do 
exist but are different, qcouch will update them.

## View Helpers

`runView`, which generally an alias to `view`, also has some added functionality.

### Just the Keys

Add `resolveto:"keys"` to the query. When you do that it will return a simple array 
of keys instead of the standard couchdb result.

### Just the Docs

You can also add `resolveto:"objects"` to the query to get a simple array of objects.

### Pagination

If you add resolveto *and* limit, you get some pagination help. The returned array 
will be `limit - 1` long (i.e. you should set limit to `pagesize + 1`), and will
have hidden pagination properties: startkey, startkey\_docid, next\_startkey, 
and next\_startkey\_docid. The next values are only set if there are more pages.

    db.runView("somedesign","someview",{ resolveto:"objects", limit:6 });
    // returns an array of 5 objects, with next_startkey and next_startkey_docid

### allDocs

If you want to use these behaviours for the allDocs function:

    db.runView("allDocs",{ resolveto:"objects", limit:6 });

## Pre-save and Post-get functions

    db = new qcouch({
      databasename : "mydb",
      fromDB : function(doc){ return replacement_doc; },
      toDB : function(doc){ return replacement_doc; }
    })

These are helpful when you want a central function that modifies documents before
they are saved (e.g. to convert your own weird classes into objects), or after
they are retrieved but before your application starts using them (e.g. to add
functions or dynamically generated values).

`fromDB` and `toDB` are applied in getDoc, runView where resolveto is `"objects"`
(including `"allDocs"`), saveDoc, and bulkDocs.