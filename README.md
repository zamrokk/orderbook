# orderbook

## Setting up the DHT

```bash
npm i -g grenache-grape
```

```bash
# boot two grape servers

grape --dp 20001 --aph 30001 --bn '127.0.0.1:20002'
grape --dp 20002 --aph 40001 --bn '127.0.0.1:20001'
```

## Start one (or several server instances)

```bash
node server.js
```

## Run the test in this order (I have implemented only the code when an ASK order is sent, the reverse function is TODO)

```bash
node clientBid.js &
node clientBid.js &
node clientBid.js &

node clientAsk.js &
```

It creates 3 bids, then an ask order will try to match/consume the bids

You can also create 1 or 2 bids and see the results when a new ask arrives. It cleans the local DB (and should dispatch the updates to the other nodes if **dispatchAll** was implemented)

## Comments

- I didn't have to time to implement the reverse **lookForAskMatchAndLock** function, but it works the opposite of the **lookForBidMatchAndLock** one. These functions are **matchers** triggered on a new bid or a new ask
- I recommend having a CRON batch parsing new unlocked bids and asks not triggered due to 2-phase commit failures when several transactions are trying to play on the same objects in parallel
- There is a missing function **dispatchAll** on the Grenache framework that is propagating a request to all other nodes. It is requested when some objects should be locked during the 2-phase commit locking mechanism. If the objects are all locked in sync, then the node can safely update these objects locally and then send a propagation update to the other nodes
- The final transaction updates are also dispatched to all other nodes and the end of the 2-phase commit success using Debezium object structure
