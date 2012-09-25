// Namespace, to avoid variable name collisions in global namespace
var Lovebird_NS = function() {
    // Private stuff goes here:

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
	    let container = document.getElementById("dumb-container");
	    try {
                while(msg = collection.items.pop()){
                    //do something with the messages here
		    let caption = document.createElement("caption");
		    caption.setAttribute("label",
					 msg.subject);
		    container.appendChild(caption);
                }
            } catch (e) {}  
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
	    Components.utils.import(
		"resource:///modules/gloda/public.js");
	    
	    /*See:  https://developer.mozilla.org/en-US/docs/Thunderbird/Creating_a_Gloda_message_query and
	     https://developer.mozilla.org/en-US/docs/Thunderbird/Gloda_examples
	    */

	    // Query for an identity:
	    var id_q = Gloda.newQuery(Gloda.NOUN_IDENTITY);
	    id_q.kind("email");
	    id_q.value("sushux@gmail.com");
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
		    //woops no identity
		    if (id_coll.items.length <= 0) return;
               
		    id=id_coll.items[0];
		    // OK now we have gloda's ID object.

		    // Query for all messages involving this person
		    let query = Gloda.newQuery(Gloda.NOUN_MESSAGE);
		    query.involves(id);
		    let collection = query.getCollection(queryListener);
		}
	    });
	},

	onUnload: function() {
	}
    };
}();