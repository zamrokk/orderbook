// This client will as the DHT for a service called `rpc_test`
// and then establishes a P2P connection it.
// It will then send { msg: 'hello' } to the RPC server

"use strict";

const { PeerRPCClient } = require("grenache-nodejs-http");
const Link = require("grenache-nodejs-link");

const link = new Link({
  grape: "http://127.0.0.1:30001",
});
link.start();

const peer = new PeerRPCClient(link, {});
peer.init();

peer.request(
  "rpc",
  { operation: "bid", client: "ChuckNorris", price: 42, quantity: 10 },
  { timeout: 2000 },
  (err, data) => {
    if (err) {
      console.error(err);
      process.exit(-1);
    }
    console.log(data);

    peer.request(
      "rpc",
      { operation: "getDB" },
      { timeout: 10000 },
      (err, data) => {
        if (err) {
          console.error(err);
          process.exit(-1);
        }
        console.log(data);
      }
    );
  }
);
