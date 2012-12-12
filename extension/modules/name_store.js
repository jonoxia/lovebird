EXPORTED_SYMBOLS = ["LovebirdNameStore"];

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const DB_FILE_NAME = "lovebird_favorite_people.sql";
const DB_TABLE_NAME = "favorite_people";


var LovebirdNameStore = {
    _dbConnection: null,
    _dirSvc: null,
    _storSvc: null,

    /* my schema only has one column (email) for now. */
    _init: function() {
	this._dirSvc = Cc["@mozilla.org/file/directory_service;1"]
            .getService(Ci.nsIProperties);
	this._storSvc = Cc["@mozilla.org/storage/service;1"]
            .getService(Ci.mozIStorageService);

	dump("Initing db\n");
	// get path to my profile directory / dbFileName:
	try {
	    let file = this._dirSvc.get("ProfD", Ci.nsIFile);
	    file.append(DB_FILE_NAME);
	    // openDatabase creates the file if it's not there yet:
	    dump("Opening file.\n");
	    this._dbConnection = this._storSvc.openDatabase(file);
	    // Create the table only if it does not already exist:
	    if(!this._dbConnection.tableExists(DB_TABLE_NAME)){
		let schema = "CREATE TABLE " + DB_TABLE_NAME +
		    " (email TEXT);";
		dump("Creating table.\n");
		this._dbConnection.executeSimpleSQL(schema);
	    } else{
		dump("Table exists already.\n");
	    }
	    dump("Database initialized OK.\n");
	} catch(e) {
	    dump("Error initing database: " + e + "\n");
	}
    },

    getPeeps: function(callback) {
	if (!this._dbConnection) {
	    this._init();
	    // TODO what if init fails?
	}

	let selectSql = "SELECT email FROM " + DB_TABLE_NAME + ";";
	let selStmt = this._dbConnection.createStatement(selectSql);
	let addresses = [];
	selStmt.executeAsync({
	    handleResult: function(aResultSet) {
		for (let row = aResultSet.getNextRow(); row;
		     row = aResultSet.getNextRow()) {
		    addresses.push(row.getUTF8String(0));
		}
	    },
	    handleError: function(aError) {
		if (callback) {
		    callback(addresses);
		}
	    },
 	    handleCompletion: function(aReason) {
		if (callback) {
		    callback(addresses);
		}
	    }
	});
	selStmt.finalize();
    },

    dedupe: function(callback) {
      this.getPeeps(function(addresses) {
          for (var i = 0; i < addresses.length; i++) {
            for (var j = i+1; j < addresses.length; j++) {
              if (addresses[i] == addresses[j]) {
                dump("Found duplicate address! " + addresses[i] + "\n")
              }
            }
          }
        });
    },

    rememberPeep: function(email) {
	if (!this._dbConnection) {
	    this._init();
	    // TODO what if init fails?
	}

	let insertSql = "INSERT INTO " + DB_TABLE_NAME
	    + " VALUES (?1);";
	let insStmt = this._dbConnection.createStatement(insertSql);
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
};
