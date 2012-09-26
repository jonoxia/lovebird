// Namespace, to avoid variable name collisions in global namespace
var Lovebird_NS = function() {
    // Private stuff goes here:
    const Cu = Components.utils;
    Cu.import("resource://lovebird/modules/name_store.js");

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
	}
    };
}();