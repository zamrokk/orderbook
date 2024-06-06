// This RPC server will announce itself as `rpc_test`
// in our Grape Bittorrent network
// When it receives requests, it will answer with 'world'

"use strict";

const { PeerRPCServer, PeerRPCClient } = require("grenache-nodejs-http");
const Link = require("grenache-nodejs-link");

let orderBook = {
  ask: [],
  bid: [],
};

const link = new Link({
  grape: "http://127.0.0.1:30001",
});
link.start();

const peer = new PeerRPCServer(link, {
  timeout: 300000,
});
peer.init();

const port = 1337;
const service = peer.transport("server");
service.listen(port);
console.log("Listening on port " + port);

//declare endpoints
const client = new PeerRPCClient(link, {});
client.init();

setInterval(function () {
  link.announce("rpc", service.port, {});
}, 1000);

// sync init State

setTimeout(function () {
  client.request(
    "rpc",
    { operation: "getDB" },
    { timeout: 10000 },
    (err, data) => {
      if (err) {
        console.error(err);
        process.exit(-1);
      }
      console.log("Initializing state at bootstrapping", data);

      if (data.bid || data.ask) {
        orderBook = data;
        console.log("State initialized to", data);
      } else console.log("There is not  data yet");
    }
  );
}, 2000);

service.on("request", async (rid, key, payload, handler) => {
  console.log(rid, key, payload, handler);
  switch (payload.operation) {
    case "ask":
      ask({ ...payload, id: rid }, handler);
      break;
    case "bid":
      bid({ ...payload, id: rid }, handler);
      break;
    case "getDB":
      getDB(handler);
      break;
    case "DBupdate":
      DBupdate(payload, handler);
      break;
    default: {
      console.error("Unknown operation", payload.operation);
      handler.reply(null, { msg: "Unknown operation" + payload.operation });
    }
  }
});

//sync current State with other nodes after 2-phase commit succeeded
const DBupdate = (payload, handler) => {
  console.log(payload);

  //INFO : Debezium standard

  /**
   * {
	"op": "u",
	"source": {
		...
	},
	"ts_ms" : "...",
	"ts_us" : "...",
	"ts_ns" : "...",
	"before" : {
		"field1" : "oldvalue1",
		"field2" : "oldvalue2"
	},
	"after" : {
		"field1" : "newvalue1",
		"field2" : "newvalue2"
	}
}

//TODO update current State memory with confirmed operations
  payload.operations.forEach((operation) => {
    switch (operation.op) {
      case "u":
        updateState(operation);
        break;
      case "i":
        insertState(operation);
        break;
      case "d":
        removeState(operation);
        break;
      default:
        handler.reply(null, {
          msg: "DBupdate failed for unknown operation " + payload.op,
        });
    }
  });
  */
};

//services

const ask = async (ask, handler) => {
  //console.log("Orderbook is ", orderBook);
  orderBook.ask.push(ask);

  const response = await lookForBidMatchAndLock(ask, handler);

  //TODO same here, we need a dispatchAll function to update state of all other nodes. This does not exist yet on the actual grenache framework
  /*await client.dispatchAll(
    "rpc",
    {
      "operation": "DBupdate",
      "operations": response.operations,
    },
    { timeout: 2000 },
    (err, data) => {
      if (err) {
        console.error(err);
        process.exit(-1);
      }
      console.log(data);
    }
  );
*/

  //send back response to client
  console.log(response);
  if (response.isOk) {
    handler.reply(null, { msg: "ask done and executed" });
  } else {
    handler.reply(null, { msg: "ask done (with no match)" });
  }
};

const bid = async (bid, handler) => {
  orderBook.bid.push(bid);

  //TODO const response = await lookForAskMatchAndLock(bid, handler);

  //TODO same here, we need a dispatchAll function to update state of all other nodes. This does not exist yet on the actual grenache framework
  /*await client.dispatchAll(
    "rpc",
    {
      "operation": "DBupdate",
      "operations": response.operations,
    },
    { timeout: 2000 },
    (err, data) => {
      if (err) {
        console.error(err);
        process.exit(-1);
      }
      console.log(data);
    }
  );
*/

  // if (response.isOk) handler.reply(null, { msg: "bid done and executed" });
  // else {
  handler.reply(null, { msg: "bid done (with no match)" });
  // }
};

const getDB = (handler) => {
  handler.reply(null, orderBook);
};

/**
 * Look for demand matches as a new offer is registered
 * @param {*} ask
 * @param {*} handler
 * @returns ok/ko boolean status if a match has been done and the list of operation to update the state of other nodes
 */
const lookForBidMatchAndLock = async (ask, handler) => {
  //prepare a list of changes for the synchronization of local node DB
  let operations = [];

  const bidFindings = orderBook.bid.filter(
    (bid) =>
      bid.price == ask.price && bid.quantity <= ask.quantity && !bid.locked
  );

  console.log("bidFindings ", bidFindings);

  if (bidFindings && bidFindings.length > 0) {
    let remainingAskQuantity = ask.quantity;

    bidFindings.forEach((bidFound) => {
      console.log("Loop on bid ", bidFound);

      //we lock here both for a match

      bidFound.locked = true;
      ask.locked = true;

      //dispatch for a 2 phase commit process
      //FIXME here we need a dispatchAll function on the grenache framework to send this information. Actual client.request does not fill this requirement yet
      //FIXME let's assume that it is returning ok for the moment
      const response = { isOk: true }; /*await client.dispatchAll(
      "rpc",
      {
        operation: "lock",
        ask: ask,
        bid,
        bidFound,
      },
      { timeout: 2000 }
    );*/

      if (response.isOk) {
        //if ok, update locally and remove the lock

        if (bidFound.quantity - remainingAskQuantity == 0) {
          // clear the bid (and ask later)

          //bid operation change
          const bidOperation = {
            "op": "d",
            "table": "bid",
            "before": bidFound,
            "after": {},
          };
          operations.push(bidOperation);

          orderBook.bid = orderBook.bid.filter(
            (bidItem) => bidItem.id !== bidFound.id
          );

          remainingAskQuantity = 0;
        } else if (bidFound.quantity - remainingAskQuantity > 0) {
          //match not complete, consume all ASK and keep the remaining on the BID

          //bid operation change
          const bidOperation = {
            "op": "u",
            "table": "bid",
            "before": bidFound,
            "after": {
              ...bidFound,
              quantity: bidFound.quantity - remainingAskQuantity,
              locked: false,
            },
          };
          operations.push(bidOperation);

          //remove the lock as there is still a remaining quantity
          bidFound.locked = false;
          bidFound.quantity = bidFound.quantity - remainingAskQuantity;
          remainingAskQuantity = 0;
        } else if (bidFound.quantity - remainingAskQuantity < 0) {
          //match not complete, consume the BID and keep the remaining on the ASK
          //ask operation change
          const bidOperation = {
            "op": "d",
            "table": "bid",
            "before": bidFound,
            "after": {},
          };
          operations.push(bidOperation);

          orderBook.bid = orderBook.bid.filter(
            (bidItem) => bidItem.id !== bidFound.id
          );

          remainingAskQuantity = remainingAskQuantity - bidFound.quantity;
        }

        //(OUT OF SCOPE for this test)
        //TODO do/call any money transfer necessary for the buyer and the seller at this time to update their currency balance.
      } else {
        //if ko, don't do anything and maybe the automatic CRON matcher will do it later when locks are out
        // we need a CRON matcher to pass sometimes to do matching as we cannot guess on a distributed system that an operation will succeed or not when we do a bid or ask and one is locked at this moment.
        //Doing infinite retry is not a good solution as it will block the flow, better to ask a batch to do it apart for all stored ask/bid orders from the order book
      }
    });

    //do all ASK operation now after the loop is finished
    if (remainingAskQuantity == 0) {
      //ask operation change
      const askOperation = {
        "op": "d",
        "table": "ask",
        "before": ask,
        "after": {},
      };
      operations.push(askOperation);

      // clear the ask
      orderBook.ask = orderBook.ask.filter((askItem) => askItem.id !== ask.id);
    } else {
      //just update
      //ask operation change
      const askOperation = {
        "op": "u",
        "table": "ask",
        "before": ask,
        "after": {
          ...ask,
          quantity: remainingAskQuantity,
          locked: false,
        },
      };
      operations.push(askOperation);

      // update the ask
      orderBook.ask = orderBook.ask.map((askItem) =>
        askItem.id == ask.id
          ? { ...askItem, quantity: remainingAskQuantity, locked: false }
          : askItem
      );
    }
  } else {
    console.log("nothing to do, there is no match");

    //bid operation change
    const askOperation = {
      "op": "i",
      "table": "ask",
      "before": {},
      "after": ask,
    };
    operations.push(askOperation);
  }

  return {
    isOk: bidFindings && bidFindings.length > 0 ? true : false,
    operations,
  };
};

const lookForAskMatchAndLock = (bid, handler) => {
  //TODO
  // same process as the lookForBidMatchAndLock function but for Ask orders
};
