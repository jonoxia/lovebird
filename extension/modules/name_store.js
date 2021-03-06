/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

EXPORTED_SYMBOLS = ["LovebirdNameStore"];

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
const DB_FILE_NAME = "lovebird_favorite_people.sql";
const PEOPLE_TABLE = "favorite_people";
const CONVO_TABLE = "conversation_statuses";

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

	// get path to my profile directory / dbFileName:
	try {
	  let file = this._dirSvc.get("ProfD", Ci.nsIFile);
	  file.append(DB_FILE_NAME);
	  // openDatabase creates the file if it's not there yet:
	  this._dbConnection = this._storSvc.openDatabase(file);
	  // Create the table only if it does not already exist:
	  if (!this._dbConnection.tableExists(PEOPLE_TABLE)){
	    let schema = "CREATE TABLE " + PEOPLE_TABLE +
	      " (email TEXT);";
	    this._dbConnection.executeSimpleSQL(schema);
	  }
          if (!this._dbConnection.tableExists(CONVO_TABLE)) {
	    let schema = "CREATE TABLE " + CONVO_TABLE +
	      " (convo_id INTEGER, status INTEGER);";
	    this._dbConnection.executeSimpleSQL(schema);
          }
	} catch(e) {
	  dump("Error initing database: " + e + "\n");
	}
    },

    getPeeps: function(callback) {
	if (!this._dbConnection) {
	    this._init();
	    // TODO what if init fails?
	}

	let selSql = "SELECT email FROM " + PEOPLE_TABLE + ";";
	let selStmt = this._dbConnection.createAsyncStatement(selSql);
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

	let insSql = "INSERT INTO " + PEOPLE_TABLE
	    + " VALUES (?1);";
	let insStmt = this._dbConnection.createAsyncStatement(insSql);
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
	    }
	});
	insStmt.finalize();
    },
  
  forgetPeep: function(email) {
    if (!this._dbConnection) {
      this._init();
      // TODO what if init fails?
    }
    
    let deleteSql = "DELETE FROM " + PEOPLE_TABLE
      + " WHERE email = ?1;";
    let delStmt = this._dbConnection.createAsyncStatement(deleteSql);
    delStmt.params[0] = email;
    delStmt.executeAsync({
      handleResult: function(aResultSet) {
      },
      handleError: function(aError) {
	dump(aError + "\n");
      },
      handleCompletion: function(aReason) {
      }
    });
    delStmt.finalize();
  },

  getConvoStatus: function(convoId, callback) {
    if (!this._dbConnection) {
      this._init();
      // TODO what if init fails?
    }
    let selSql = "SELECT status FROM " + CONVO_TABLE 
      + " WHERE convo_id=?1;";
    let selStmt = this._dbConnection.createAsyncStatement(selSql);
    selStmt.params[0] = convoId;
    let convoStatus = -1; // This will mean "no status stored yet".
    selStmt.executeAsync({
      handleResult: function(aResultSet) {
        var row = aResultSet.getNextRow();
        if (row) {
          convoStatus = row.getResultByName("status");
	}
      },
      handleError: function(aError) {
        dump("ERROR: " + aError + "\n");
	if (callback) {
	  callback(convoStatus);
	}
      },
      handleCompletion: function(aReason) {
	if (callback) {
	  callback(convoStatus);
	}
      }
    });
    selStmt.finalize();
  },

  rememberConvoStatus: function(convoId, status) {
    if (!this._dbConnection) {
      this._init();
      // TODO what if init fails?
    }
    var dbConnection = this._dbConnection;
    LovebirdNameStore.getConvoStatus(convoId, function(exists) {
      let stmt;
      if (exists == -1) {
        // no entry yet: Insert one!
        let insertSql = "INSERT INTO " + CONVO_TABLE
          + " VALUES (?1, ?2);";
        stmt = dbConnection.createAsyncStatement(insertSql);
	stmt.params[0] = convoId;
        stmt.params[1] = status;
      } else {
        // Entry exists: Update it!
        let updateSql = "UPDATE " + CONVO_TABLE + " SET status=?1"
          + " WHERE convo_id = ?2;";
        stmt = dbConnection.createAsyncStatement(updateSql);
        stmt.params[0] = status;
        stmt.params[1] = convoId;
      }
      stmt.executeAsync({
        handleResult: function(aResultSet) {
        },
        handleError: function(aError) {
	  dump("RememerConvoStatus got error: " + aError + "\n");
        },
        handleCompletion: function(aReason) {
        }
      });
      stmt.finalize();
    });
  }
};
