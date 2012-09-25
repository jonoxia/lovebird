// Namespace, to avoid variable name collisions in global namespace
var Lovebird_NS = function() {
    // Private stuff goes here:

    let Ci = Components.interfaces;
    let Cc = Components.classes;
    let Cu = Components.utils;

    let _dirSvc = Cc["@mozilla.org/file/directory_service;1"]
        .getService(Ci.nsIProperties);
    let _storSvc = Cc["@mozilla.org/storage/service;1"]
        .getService(Ci.mozIStorageService);
    
    let dbFileName = "lovebird_favorite_people.sql";
    let dbTableName = "favorite_people";

    let dbConnection = null;

    /* my schema only has one column (email) for now. */
    // TODO: Move database handling to a module?
    let initDb = function() {
	dump("Initing db\n");
	let connection = null;
	// get path to my profile directory / dbFileName:
	try {
	    let file = _dirSvc.get("ProfD", Ci.nsIFile);
	    file.append(dbFileName);
	    // openDatabase creates the file if it's not there yet:
	    dump("Opening file.\n");
	    connection = _storSvc.openDatabase(file);
	    // Create the table only if it does not already exist:
	    if(!connection.tableExists(dbTableName)){
		let schema = "CREATE TABLE " + dbTableName +
		    " (email TEXT);";
		dump("Creating table.\n");
		connection.executeSimpleSQL(schema);
	    } else{
		dump("Table exists already.\n");
	    }
	    dump("Database initialized OK.\n");
	} catch(e) {
	    dump("Error initing database: " + e + "\n");
	}
	return connection;
    };

    let getPeeps = function(callback) {
	if (dbConnection != null && callback != null) {
	    let selectSql = "SELECT email FROM " + dbTableName + ";";
	    let selStmt = dbConnection.createStatement(selectSql);
	    let addresses = [];
	    selStmt.executeAsync({
		handleResult: function(aResultSet) {
		    for (let row = aResultSet.getNextRow(); row;
			 row = aResultSet.getNextRow()) {
			addresses.push(row.getUTF8String(0));
		    }
		},
		handleError: function(aError) {
		    callback(addresses);
		},
 		handleCompletion: function(aReason) {
		    callback(addresses);
		}
	    });
	    selStmt.finalize();
        }
    };

    let myEmail = "jono@fastmail.fm";

    let queryListener = {
	onItemsAdded: function ql_onItemsAdded(aItems, aCollection) {
	},

	/* called when items that are already in our collection 
	 * get re-indexed */
	onItemsModified: function ql_onItemsModified(aItems,
						     aCollection) {
	},

	/* called when items that are in our collection are purged 
	 * from the system */
	onItemsRemoved: function ql_onItemsRemoved(aItems, 
						   aCollection) {
	},

	/* called when our database query completes */
	onQueryCompleted: function ql_onQueryCompleted(collection) {
	    let theList = document.getElementById("lb-main-list");
	    // TODO how do I explicitly sort this collection by date?
	    // that seems to be the default sort so I'll just take
	    // first item for now...
            //while(msg = collection.items.pop()){

	    var msg = collection.items.pop();

	    var row = document.createElement('listitem');
	    var cell = document.createElement('listcell');
	    if (msg.from.value == myEmail) {
		// "to" is a list:
		cell.setAttribute('label',
				  "Me to " + msg.to[0].value);
	    } else {
		cell.setAttribute('label',
				  msg.from.value + " to me");
	    }

	    row.appendChild(cell);
	    
	    cell = document.createElement('listcell');
	    cell.setAttribute('label', msg.subject);
	    row.appendChild(cell);
	    
	    cell = document.createElement('listcell');
	    cell.setAttribute('label', msg.date);
	    row.appendChild(cell);
	    
	    theList.appendChild(row);
	}
    };
    // Public interface:
    return {
	openWindow: function() {
	    var newWindow = window.open(
		"chrome://lovebird/content/window.xul",
		"Lovebird_mainWindow",
		"chrome,titlebar,centerscreen,dialog=no"
	    );
	},
	
	onLoad: function() {
	    Cu.import("resource:///modules/gloda/public.js");
	    
	    /*See:  https://developer.mozilla.org/en-US/docs/Thunderbird/Creating_a_Gloda_message_query and
	     https://developer.mozilla.org/en-US/docs/Thunderbird/Gloda_examples
	    */

	    // TODO actually must init this connection on startup
	    // not on window load, so that you can Luv a person even
	    // if the window isn't open.
	    dbConnection = initDb();
	    
	    // Read list of lovely peeps from sqlite:
	    dump("Getting peeps.\n");
	    getPeeps(function(peeps) {
		dump("Got peeps.");
		// Query for an identity for each:
		var id_q = Gloda.newQuery(Gloda.NOUN_IDENTITY);
		id_q.kind("email");

		/* use "apply" to make each name in myPeeps array an
		 * argument to id_q.value(). That will result in the
		 * query doing an OR across all of them. */
		dump("My peeps are " + peeps + "\n");
		id_q.value.apply(id_q, peeps);
		id_coll=id_q.getCollection({
		    onItemsAdded: function _onAdded(aItems,
						    aCollection) {
		    },
		    onItemsModified: function _onModified(aItems,
							  aCollection) {
		    },
		    onItemsRemoved: function _onRemoved(aItems,
							aCollection) {
		    },
		    onQueryCompleted: function _onCompleted(id_coll) {
			dump("There are " + id_coll.items.length +
			     " people\n");
			// For each person we get back, do a query
			// for that person's latest message:
			for (var i = 0; i < id_coll.items.length; i++) {
			    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);

			    query.involves(id_coll.items[i]);
			    let collection = query.getCollection(queryListener);
			}
		    } // end onQueryCompleted
		}); // end getCollection
	    }); // end getPeeps
	}, // end onLoad

	onUnload: function() {
	},

	lovePeep: function(email) {
	    if (dbConnection != null) {
		let insertSql = "INSERT INTO " + dbTableName
		    + " VALUES (?1);";
		let insStmt = dbConnection.createStatement(insertSql);
		// TODO make sure this email address isn't already
		// in the db before adding it again?
		insStmt.params[0] = email;
		insStmt.executeAsync({
		    handleResult: function(aResultSet) {
		    },
		    handleError: function(aError) {
			dump(aError + "\n");
		    },
		    handleCompletion: function(aReason) {
			dump("database insertion complete.\n");
		    }
		});
		insStmt.finalize();
	    }
	}
    };
}();