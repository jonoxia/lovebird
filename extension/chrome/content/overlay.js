// Namespace, to avoid variable name collisions in global namespace
var Lovebird_NS = function() {
  // Private stuff goes here:
  const Cu = Components.utils;
  const Ci = Components.interfaces;
  const Cc = Components.classes;
  Cu.import("resource://lovebird/modules/name_store.js");

  let myEmail = "jono@fastmail.fm";

function openReplyWindow(msgUri) {
    let msgComposeService=
      Cc["@mozilla.org/messengercompose;1"]
      .getService(Ci.nsIMsgComposeService);
    // make the URI object
    let ioService = Cc["@mozilla.org/network/io-service;1"]
      .getService(Ci.nsIIOService);
    let msgURI = ioService.newURI(msgUri, null, null);
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
    // Get the message database header for the given message uri:
    let msgDbHdr = messenger.msgHdrFromURI(msgUri);
    
    /* We need to provide an identity to define who is replying. Determining
     * the right identity can be fairly complicated. We'll try several fallbacks
     * for getting an appropriate identity. This code is a simplification of the
     * getIdentity functions in mailCommands.js. See
     * http://mxr.mozilla.org/comm-central/source/mail/base/content/mailCommands.js */
    let folder = msgDbHdr.folder;
    let server = folder.server;
    /* If there was a custom identity for the folder of the original message,
     * use that. */
    let identity = folder.customIdentity;
    let accountManager = Cc["@mozilla.org/messenger/account-manager;1"]
      .getService(Ci.nsIMsgAccountManager);
    if (!identity) {
      // if there are multiple identities on the server, use the first one
      identity = accountManager.GetIdentitiesForServer(server)
        .QueryElementAt(0, Ci.nsIMsgIdentity);
      if (!identity) {
        // if that still doesn't work, use the default identity.
        identity = accountManager.defaultAccount.defaultIdentity;
      }
    }
    let msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"]
      .createInstance(Ci.nsIMsgWindow);
    msgComposeService.OpenComposeWindow(null, msgDbHdr, msgUri,
                                        Ci.nsIMsgCompType.Reply,
                                        Ci.nsIMsgCompFormat.Default,
                                        identity, msgWindow);
  }
  
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

	    dump("Debug msg, looking for nsIMsgDbHdr...\n");
	    for (var prop in msg) {
		dump("msg[" + prop + "] = " + msg[prop] + "\n");
	    }

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

	    row.setAttribute("jono_data", msg.folderMessageURI);
	    
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

	    // Read list of lovely peeps from sqlite:
	    dump("Getting peeps.\n");
	    LovebirdNameStore.getPeeps(function(peeps) {
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

	contextClick: function(event) {
	    /* Called when you right-click a message and say 
	     * "luv this person". Gets email address of sender
	     * of selected message, adds it to favorites. */
	    var selectedMsg = gFolderDisplay.selectedMessage;
	    // this is a nsIMsgDBHdr
	    Gloda.getMessageCollectionForHeader(selectedMsg,
		{
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
		      var email = id_coll.items[0].from.value;
		      dump("Luving " + email + "\n");
		      LovebirdNameStore.rememberPeep(email);
		  }
		});
	},

	listDblClick: function(event) {
	  let msgUri = event.originalTarget.getAttribute("jono_data");
          openReplyWindow(msgUri);
        }
    };
}();