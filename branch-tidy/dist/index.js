import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ var __webpack_modules__ = ({

/***/ 251:
/***/ (function(module) {

/**
  * This file contains the Bottleneck library (MIT), compiled to ES2017, and without Clustering support.
  * https://github.com/SGrondin/bottleneck
  */
(function (global, factory) {
	 true ? module.exports = factory() :
	0;
}(this, (function () { 'use strict';

	var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function getCjsExportFromNamespace (n) {
		return n && n['default'] || n;
	}

	var load = function(received, defaults, onto = {}) {
	  var k, ref, v;
	  for (k in defaults) {
	    v = defaults[k];
	    onto[k] = (ref = received[k]) != null ? ref : v;
	  }
	  return onto;
	};

	var overwrite = function(received, defaults, onto = {}) {
	  var k, v;
	  for (k in received) {
	    v = received[k];
	    if (defaults[k] !== void 0) {
	      onto[k] = v;
	    }
	  }
	  return onto;
	};

	var parser = {
		load: load,
		overwrite: overwrite
	};

	var DLList;

	DLList = class DLList {
	  constructor(incr, decr) {
	    this.incr = incr;
	    this.decr = decr;
	    this._first = null;
	    this._last = null;
	    this.length = 0;
	  }

	  push(value) {
	    var node;
	    this.length++;
	    if (typeof this.incr === "function") {
	      this.incr();
	    }
	    node = {
	      value,
	      prev: this._last,
	      next: null
	    };
	    if (this._last != null) {
	      this._last.next = node;
	      this._last = node;
	    } else {
	      this._first = this._last = node;
	    }
	    return void 0;
	  }

	  shift() {
	    var value;
	    if (this._first == null) {
	      return;
	    } else {
	      this.length--;
	      if (typeof this.decr === "function") {
	        this.decr();
	      }
	    }
	    value = this._first.value;
	    if ((this._first = this._first.next) != null) {
	      this._first.prev = null;
	    } else {
	      this._last = null;
	    }
	    return value;
	  }

	  first() {
	    if (this._first != null) {
	      return this._first.value;
	    }
	  }

	  getArray() {
	    var node, ref, results;
	    node = this._first;
	    results = [];
	    while (node != null) {
	      results.push((ref = node, node = node.next, ref.value));
	    }
	    return results;
	  }

	  forEachShift(cb) {
	    var node;
	    node = this.shift();
	    while (node != null) {
	      (cb(node), node = this.shift());
	    }
	    return void 0;
	  }

	  debug() {
	    var node, ref, ref1, ref2, results;
	    node = this._first;
	    results = [];
	    while (node != null) {
	      results.push((ref = node, node = node.next, {
	        value: ref.value,
	        prev: (ref1 = ref.prev) != null ? ref1.value : void 0,
	        next: (ref2 = ref.next) != null ? ref2.value : void 0
	      }));
	    }
	    return results;
	  }

	};

	var DLList_1 = DLList;

	var Events;

	Events = class Events {
	  constructor(instance) {
	    this.instance = instance;
	    this._events = {};
	    if ((this.instance.on != null) || (this.instance.once != null) || (this.instance.removeAllListeners != null)) {
	      throw new Error("An Emitter already exists for this object");
	    }
	    this.instance.on = (name, cb) => {
	      return this._addListener(name, "many", cb);
	    };
	    this.instance.once = (name, cb) => {
	      return this._addListener(name, "once", cb);
	    };
	    this.instance.removeAllListeners = (name = null) => {
	      if (name != null) {
	        return delete this._events[name];
	      } else {
	        return this._events = {};
	      }
	    };
	  }

	  _addListener(name, status, cb) {
	    var base;
	    if ((base = this._events)[name] == null) {
	      base[name] = [];
	    }
	    this._events[name].push({cb, status});
	    return this.instance;
	  }

	  listenerCount(name) {
	    if (this._events[name] != null) {
	      return this._events[name].length;
	    } else {
	      return 0;
	    }
	  }

	  async trigger(name, ...args) {
	    var e, promises;
	    try {
	      if (name !== "debug") {
	        this.trigger("debug", `Event triggered: ${name}`, args);
	      }
	      if (this._events[name] == null) {
	        return;
	      }
	      this._events[name] = this._events[name].filter(function(listener) {
	        return listener.status !== "none";
	      });
	      promises = this._events[name].map(async(listener) => {
	        var e, returned;
	        if (listener.status === "none") {
	          return;
	        }
	        if (listener.status === "once") {
	          listener.status = "none";
	        }
	        try {
	          returned = typeof listener.cb === "function" ? listener.cb(...args) : void 0;
	          if (typeof (returned != null ? returned.then : void 0) === "function") {
	            return (await returned);
	          } else {
	            return returned;
	          }
	        } catch (error) {
	          e = error;
	          {
	            this.trigger("error", e);
	          }
	          return null;
	        }
	      });
	      return ((await Promise.all(promises))).find(function(x) {
	        return x != null;
	      });
	    } catch (error) {
	      e = error;
	      {
	        this.trigger("error", e);
	      }
	      return null;
	    }
	  }

	};

	var Events_1 = Events;

	var DLList$1, Events$1, Queues;

	DLList$1 = DLList_1;

	Events$1 = Events_1;

	Queues = class Queues {
	  constructor(num_priorities) {
	    var i;
	    this.Events = new Events$1(this);
	    this._length = 0;
	    this._lists = (function() {
	      var j, ref, results;
	      results = [];
	      for (i = j = 1, ref = num_priorities; (1 <= ref ? j <= ref : j >= ref); i = 1 <= ref ? ++j : --j) {
	        results.push(new DLList$1((() => {
	          return this.incr();
	        }), (() => {
	          return this.decr();
	        })));
	      }
	      return results;
	    }).call(this);
	  }

	  incr() {
	    if (this._length++ === 0) {
	      return this.Events.trigger("leftzero");
	    }
	  }

	  decr() {
	    if (--this._length === 0) {
	      return this.Events.trigger("zero");
	    }
	  }

	  push(job) {
	    return this._lists[job.options.priority].push(job);
	  }

	  queued(priority) {
	    if (priority != null) {
	      return this._lists[priority].length;
	    } else {
	      return this._length;
	    }
	  }

	  shiftAll(fn) {
	    return this._lists.forEach(function(list) {
	      return list.forEachShift(fn);
	    });
	  }

	  getFirst(arr = this._lists) {
	    var j, len, list;
	    for (j = 0, len = arr.length; j < len; j++) {
	      list = arr[j];
	      if (list.length > 0) {
	        return list;
	      }
	    }
	    return [];
	  }

	  shiftLastFrom(priority) {
	    return this.getFirst(this._lists.slice(priority).reverse()).shift();
	  }

	};

	var Queues_1 = Queues;

	var BottleneckError;

	BottleneckError = class BottleneckError extends Error {};

	var BottleneckError_1 = BottleneckError;

	var BottleneckError$1, DEFAULT_PRIORITY, Job, NUM_PRIORITIES, parser$1;

	NUM_PRIORITIES = 10;

	DEFAULT_PRIORITY = 5;

	parser$1 = parser;

	BottleneckError$1 = BottleneckError_1;

	Job = class Job {
	  constructor(task, args, options, jobDefaults, rejectOnDrop, Events, _states, Promise) {
	    this.task = task;
	    this.args = args;
	    this.rejectOnDrop = rejectOnDrop;
	    this.Events = Events;
	    this._states = _states;
	    this.Promise = Promise;
	    this.options = parser$1.load(options, jobDefaults);
	    this.options.priority = this._sanitizePriority(this.options.priority);
	    if (this.options.id === jobDefaults.id) {
	      this.options.id = `${this.options.id}-${this._randomIndex()}`;
	    }
	    this.promise = new this.Promise((_resolve, _reject) => {
	      this._resolve = _resolve;
	      this._reject = _reject;
	    });
	    this.retryCount = 0;
	  }

	  _sanitizePriority(priority) {
	    var sProperty;
	    sProperty = ~~priority !== priority ? DEFAULT_PRIORITY : priority;
	    if (sProperty < 0) {
	      return 0;
	    } else if (sProperty > NUM_PRIORITIES - 1) {
	      return NUM_PRIORITIES - 1;
	    } else {
	      return sProperty;
	    }
	  }

	  _randomIndex() {
	    return Math.random().toString(36).slice(2);
	  }

	  doDrop({error, message = "This job has been dropped by Bottleneck"} = {}) {
	    if (this._states.remove(this.options.id)) {
	      if (this.rejectOnDrop) {
	        this._reject(error != null ? error : new BottleneckError$1(message));
	      }
	      this.Events.trigger("dropped", {args: this.args, options: this.options, task: this.task, promise: this.promise});
	      return true;
	    } else {
	      return false;
	    }
	  }

	  _assertStatus(expected) {
	    var status;
	    status = this._states.jobStatus(this.options.id);
	    if (!(status === expected || (expected === "DONE" && status === null))) {
	      throw new BottleneckError$1(`Invalid job status ${status}, expected ${expected}. Please open an issue at https://github.com/SGrondin/bottleneck/issues`);
	    }
	  }

	  doReceive() {
	    this._states.start(this.options.id);
	    return this.Events.trigger("received", {args: this.args, options: this.options});
	  }

	  doQueue(reachedHWM, blocked) {
	    this._assertStatus("RECEIVED");
	    this._states.next(this.options.id);
	    return this.Events.trigger("queued", {args: this.args, options: this.options, reachedHWM, blocked});
	  }

	  doRun() {
	    if (this.retryCount === 0) {
	      this._assertStatus("QUEUED");
	      this._states.next(this.options.id);
	    } else {
	      this._assertStatus("EXECUTING");
	    }
	    return this.Events.trigger("scheduled", {args: this.args, options: this.options});
	  }

	  async doExecute(chained, clearGlobalState, run, free) {
	    var error, eventInfo, passed;
	    if (this.retryCount === 0) {
	      this._assertStatus("RUNNING");
	      this._states.next(this.options.id);
	    } else {
	      this._assertStatus("EXECUTING");
	    }
	    eventInfo = {args: this.args, options: this.options, retryCount: this.retryCount};
	    this.Events.trigger("executing", eventInfo);
	    try {
	      passed = (await (chained != null ? chained.schedule(this.options, this.task, ...this.args) : this.task(...this.args)));
	      if (clearGlobalState()) {
	        this.doDone(eventInfo);
	        await free(this.options, eventInfo);
	        this._assertStatus("DONE");
	        return this._resolve(passed);
	      }
	    } catch (error1) {
	      error = error1;
	      return this._onFailure(error, eventInfo, clearGlobalState, run, free);
	    }
	  }

	  doExpire(clearGlobalState, run, free) {
	    var error, eventInfo;
	    if (this._states.jobStatus(this.options.id === "RUNNING")) {
	      this._states.next(this.options.id);
	    }
	    this._assertStatus("EXECUTING");
	    eventInfo = {args: this.args, options: this.options, retryCount: this.retryCount};
	    error = new BottleneckError$1(`This job timed out after ${this.options.expiration} ms.`);
	    return this._onFailure(error, eventInfo, clearGlobalState, run, free);
	  }

	  async _onFailure(error, eventInfo, clearGlobalState, run, free) {
	    var retry, retryAfter;
	    if (clearGlobalState()) {
	      retry = (await this.Events.trigger("failed", error, eventInfo));
	      if (retry != null) {
	        retryAfter = ~~retry;
	        this.Events.trigger("retry", `Retrying ${this.options.id} after ${retryAfter} ms`, eventInfo);
	        this.retryCount++;
	        return run(retryAfter);
	      } else {
	        this.doDone(eventInfo);
	        await free(this.options, eventInfo);
	        this._assertStatus("DONE");
	        return this._reject(error);
	      }
	    }
	  }

	  doDone(eventInfo) {
	    this._assertStatus("EXECUTING");
	    this._states.next(this.options.id);
	    return this.Events.trigger("done", eventInfo);
	  }

	};

	var Job_1 = Job;

	var BottleneckError$2, LocalDatastore, parser$2;

	parser$2 = parser;

	BottleneckError$2 = BottleneckError_1;

	LocalDatastore = class LocalDatastore {
	  constructor(instance, storeOptions, storeInstanceOptions) {
	    this.instance = instance;
	    this.storeOptions = storeOptions;
	    this.clientId = this.instance._randomIndex();
	    parser$2.load(storeInstanceOptions, storeInstanceOptions, this);
	    this._nextRequest = this._lastReservoirRefresh = this._lastReservoirIncrease = Date.now();
	    this._running = 0;
	    this._done = 0;
	    this._unblockTime = 0;
	    this.ready = this.Promise.resolve();
	    this.clients = {};
	    this._startHeartbeat();
	  }

	  _startHeartbeat() {
	    var base;
	    if ((this.heartbeat == null) && (((this.storeOptions.reservoirRefreshInterval != null) && (this.storeOptions.reservoirRefreshAmount != null)) || ((this.storeOptions.reservoirIncreaseInterval != null) && (this.storeOptions.reservoirIncreaseAmount != null)))) {
	      return typeof (base = (this.heartbeat = setInterval(() => {
	        var amount, incr, maximum, now, reservoir;
	        now = Date.now();
	        if ((this.storeOptions.reservoirRefreshInterval != null) && now >= this._lastReservoirRefresh + this.storeOptions.reservoirRefreshInterval) {
	          this._lastReservoirRefresh = now;
	          this.storeOptions.reservoir = this.storeOptions.reservoirRefreshAmount;
	          this.instance._drainAll(this.computeCapacity());
	        }
	        if ((this.storeOptions.reservoirIncreaseInterval != null) && now >= this._lastReservoirIncrease + this.storeOptions.reservoirIncreaseInterval) {
	          ({
	            reservoirIncreaseAmount: amount,
	            reservoirIncreaseMaximum: maximum,
	            reservoir
	          } = this.storeOptions);
	          this._lastReservoirIncrease = now;
	          incr = maximum != null ? Math.min(amount, maximum - reservoir) : amount;
	          if (incr > 0) {
	            this.storeOptions.reservoir += incr;
	            return this.instance._drainAll(this.computeCapacity());
	          }
	        }
	      }, this.heartbeatInterval))).unref === "function" ? base.unref() : void 0;
	    } else {
	      return clearInterval(this.heartbeat);
	    }
	  }

	  async __publish__(message) {
	    await this.yieldLoop();
	    return this.instance.Events.trigger("message", message.toString());
	  }

	  async __disconnect__(flush) {
	    await this.yieldLoop();
	    clearInterval(this.heartbeat);
	    return this.Promise.resolve();
	  }

	  yieldLoop(t = 0) {
	    return new this.Promise(function(resolve, reject) {
	      return setTimeout(resolve, t);
	    });
	  }

	  computePenalty() {
	    var ref;
	    return (ref = this.storeOptions.penalty) != null ? ref : (15 * this.storeOptions.minTime) || 5000;
	  }

	  async __updateSettings__(options) {
	    await this.yieldLoop();
	    parser$2.overwrite(options, options, this.storeOptions);
	    this._startHeartbeat();
	    this.instance._drainAll(this.computeCapacity());
	    return true;
	  }

	  async __running__() {
	    await this.yieldLoop();
	    return this._running;
	  }

	  async __queued__() {
	    await this.yieldLoop();
	    return this.instance.queued();
	  }

	  async __done__() {
	    await this.yieldLoop();
	    return this._done;
	  }

	  async __groupCheck__(time) {
	    await this.yieldLoop();
	    return (this._nextRequest + this.timeout) < time;
	  }

	  computeCapacity() {
	    var maxConcurrent, reservoir;
	    ({maxConcurrent, reservoir} = this.storeOptions);
	    if ((maxConcurrent != null) && (reservoir != null)) {
	      return Math.min(maxConcurrent - this._running, reservoir);
	    } else if (maxConcurrent != null) {
	      return maxConcurrent - this._running;
	    } else if (reservoir != null) {
	      return reservoir;
	    } else {
	      return null;
	    }
	  }

	  conditionsCheck(weight) {
	    var capacity;
	    capacity = this.computeCapacity();
	    return (capacity == null) || weight <= capacity;
	  }

	  async __incrementReservoir__(incr) {
	    var reservoir;
	    await this.yieldLoop();
	    reservoir = this.storeOptions.reservoir += incr;
	    this.instance._drainAll(this.computeCapacity());
	    return reservoir;
	  }

	  async __currentReservoir__() {
	    await this.yieldLoop();
	    return this.storeOptions.reservoir;
	  }

	  isBlocked(now) {
	    return this._unblockTime >= now;
	  }

	  check(weight, now) {
	    return this.conditionsCheck(weight) && (this._nextRequest - now) <= 0;
	  }

	  async __check__(weight) {
	    var now;
	    await this.yieldLoop();
	    now = Date.now();
	    return this.check(weight, now);
	  }

	  async __register__(index, weight, expiration) {
	    var now, wait;
	    await this.yieldLoop();
	    now = Date.now();
	    if (this.conditionsCheck(weight)) {
	      this._running += weight;
	      if (this.storeOptions.reservoir != null) {
	        this.storeOptions.reservoir -= weight;
	      }
	      wait = Math.max(this._nextRequest - now, 0);
	      this._nextRequest = now + wait + this.storeOptions.minTime;
	      return {
	        success: true,
	        wait,
	        reservoir: this.storeOptions.reservoir
	      };
	    } else {
	      return {
	        success: false
	      };
	    }
	  }

	  strategyIsBlock() {
	    return this.storeOptions.strategy === 3;
	  }

	  async __submit__(queueLength, weight) {
	    var blocked, now, reachedHWM;
	    await this.yieldLoop();
	    if ((this.storeOptions.maxConcurrent != null) && weight > this.storeOptions.maxConcurrent) {
	      throw new BottleneckError$2(`Impossible to add a job having a weight of ${weight} to a limiter having a maxConcurrent setting of ${this.storeOptions.maxConcurrent}`);
	    }
	    now = Date.now();
	    reachedHWM = (this.storeOptions.highWater != null) && queueLength === this.storeOptions.highWater && !this.check(weight, now);
	    blocked = this.strategyIsBlock() && (reachedHWM || this.isBlocked(now));
	    if (blocked) {
	      this._unblockTime = now + this.computePenalty();
	      this._nextRequest = this._unblockTime + this.storeOptions.minTime;
	      this.instance._dropAllQueued();
	    }
	    return {
	      reachedHWM,
	      blocked,
	      strategy: this.storeOptions.strategy
	    };
	  }

	  async __free__(index, weight) {
	    await this.yieldLoop();
	    this._running -= weight;
	    this._done += weight;
	    this.instance._drainAll(this.computeCapacity());
	    return {
	      running: this._running
	    };
	  }

	};

	var LocalDatastore_1 = LocalDatastore;

	var BottleneckError$3, States;

	BottleneckError$3 = BottleneckError_1;

	States = class States {
	  constructor(status1) {
	    this.status = status1;
	    this._jobs = {};
	    this.counts = this.status.map(function() {
	      return 0;
	    });
	  }

	  next(id) {
	    var current, next;
	    current = this._jobs[id];
	    next = current + 1;
	    if ((current != null) && next < this.status.length) {
	      this.counts[current]--;
	      this.counts[next]++;
	      return this._jobs[id]++;
	    } else if (current != null) {
	      this.counts[current]--;
	      return delete this._jobs[id];
	    }
	  }

	  start(id) {
	    var initial;
	    initial = 0;
	    this._jobs[id] = initial;
	    return this.counts[initial]++;
	  }

	  remove(id) {
	    var current;
	    current = this._jobs[id];
	    if (current != null) {
	      this.counts[current]--;
	      delete this._jobs[id];
	    }
	    return current != null;
	  }

	  jobStatus(id) {
	    var ref;
	    return (ref = this.status[this._jobs[id]]) != null ? ref : null;
	  }

	  statusJobs(status) {
	    var k, pos, ref, results, v;
	    if (status != null) {
	      pos = this.status.indexOf(status);
	      if (pos < 0) {
	        throw new BottleneckError$3(`status must be one of ${this.status.join(', ')}`);
	      }
	      ref = this._jobs;
	      results = [];
	      for (k in ref) {
	        v = ref[k];
	        if (v === pos) {
	          results.push(k);
	        }
	      }
	      return results;
	    } else {
	      return Object.keys(this._jobs);
	    }
	  }

	  statusCounts() {
	    return this.counts.reduce(((acc, v, i) => {
	      acc[this.status[i]] = v;
	      return acc;
	    }), {});
	  }

	};

	var States_1 = States;

	var DLList$2, Sync;

	DLList$2 = DLList_1;

	Sync = class Sync {
	  constructor(name, Promise) {
	    this.schedule = this.schedule.bind(this);
	    this.name = name;
	    this.Promise = Promise;
	    this._running = 0;
	    this._queue = new DLList$2();
	  }

	  isEmpty() {
	    return this._queue.length === 0;
	  }

	  async _tryToRun() {
	    var args, cb, error, reject, resolve, returned, task;
	    if ((this._running < 1) && this._queue.length > 0) {
	      this._running++;
	      ({task, args, resolve, reject} = this._queue.shift());
	      cb = (await (async function() {
	        try {
	          returned = (await task(...args));
	          return function() {
	            return resolve(returned);
	          };
	        } catch (error1) {
	          error = error1;
	          return function() {
	            return reject(error);
	          };
	        }
	      })());
	      this._running--;
	      this._tryToRun();
	      return cb();
	    }
	  }

	  schedule(task, ...args) {
	    var promise, reject, resolve;
	    resolve = reject = null;
	    promise = new this.Promise(function(_resolve, _reject) {
	      resolve = _resolve;
	      return reject = _reject;
	    });
	    this._queue.push({task, args, resolve, reject});
	    this._tryToRun();
	    return promise;
	  }

	};

	var Sync_1 = Sync;

	var version = "2.19.5";
	var version$1 = {
		version: version
	};

	var version$2 = /*#__PURE__*/Object.freeze({
		version: version,
		default: version$1
	});

	var require$$2 = () => console.log('You must import the full version of Bottleneck in order to use this feature.');

	var require$$3 = () => console.log('You must import the full version of Bottleneck in order to use this feature.');

	var require$$4 = () => console.log('You must import the full version of Bottleneck in order to use this feature.');

	var Events$2, Group, IORedisConnection$1, RedisConnection$1, Scripts$1, parser$3;

	parser$3 = parser;

	Events$2 = Events_1;

	RedisConnection$1 = require$$2;

	IORedisConnection$1 = require$$3;

	Scripts$1 = require$$4;

	Group = (function() {
	  class Group {
	    constructor(limiterOptions = {}) {
	      this.deleteKey = this.deleteKey.bind(this);
	      this.limiterOptions = limiterOptions;
	      parser$3.load(this.limiterOptions, this.defaults, this);
	      this.Events = new Events$2(this);
	      this.instances = {};
	      this.Bottleneck = Bottleneck_1;
	      this._startAutoCleanup();
	      this.sharedConnection = this.connection != null;
	      if (this.connection == null) {
	        if (this.limiterOptions.datastore === "redis") {
	          this.connection = new RedisConnection$1(Object.assign({}, this.limiterOptions, {Events: this.Events}));
	        } else if (this.limiterOptions.datastore === "ioredis") {
	          this.connection = new IORedisConnection$1(Object.assign({}, this.limiterOptions, {Events: this.Events}));
	        }
	      }
	    }

	    key(key = "") {
	      var ref;
	      return (ref = this.instances[key]) != null ? ref : (() => {
	        var limiter;
	        limiter = this.instances[key] = new this.Bottleneck(Object.assign(this.limiterOptions, {
	          id: `${this.id}-${key}`,
	          timeout: this.timeout,
	          connection: this.connection
	        }));
	        this.Events.trigger("created", limiter, key);
	        return limiter;
	      })();
	    }

	    async deleteKey(key = "") {
	      var deleted, instance;
	      instance = this.instances[key];
	      if (this.connection) {
	        deleted = (await this.connection.__runCommand__(['del', ...Scripts$1.allKeys(`${this.id}-${key}`)]));
	      }
	      if (instance != null) {
	        delete this.instances[key];
	        await instance.disconnect();
	      }
	      return (instance != null) || deleted > 0;
	    }

	    limiters() {
	      var k, ref, results, v;
	      ref = this.instances;
	      results = [];
	      for (k in ref) {
	        v = ref[k];
	        results.push({
	          key: k,
	          limiter: v
	        });
	      }
	      return results;
	    }

	    keys() {
	      return Object.keys(this.instances);
	    }

	    async clusterKeys() {
	      var cursor, end, found, i, k, keys, len, next, start;
	      if (this.connection == null) {
	        return this.Promise.resolve(this.keys());
	      }
	      keys = [];
	      cursor = null;
	      start = `b_${this.id}-`.length;
	      end = "_settings".length;
	      while (cursor !== 0) {
	        [next, found] = (await this.connection.__runCommand__(["scan", cursor != null ? cursor : 0, "match", `b_${this.id}-*_settings`, "count", 10000]));
	        cursor = ~~next;
	        for (i = 0, len = found.length; i < len; i++) {
	          k = found[i];
	          keys.push(k.slice(start, -end));
	        }
	      }
	      return keys;
	    }

	    _startAutoCleanup() {
	      var base;
	      clearInterval(this.interval);
	      return typeof (base = (this.interval = setInterval(async() => {
	        var e, k, ref, results, time, v;
	        time = Date.now();
	        ref = this.instances;
	        results = [];
	        for (k in ref) {
	          v = ref[k];
	          try {
	            if ((await v._store.__groupCheck__(time))) {
	              results.push(this.deleteKey(k));
	            } else {
	              results.push(void 0);
	            }
	          } catch (error) {
	            e = error;
	            results.push(v.Events.trigger("error", e));
	          }
	        }
	        return results;
	      }, this.timeout / 2))).unref === "function" ? base.unref() : void 0;
	    }

	    updateSettings(options = {}) {
	      parser$3.overwrite(options, this.defaults, this);
	      parser$3.overwrite(options, options, this.limiterOptions);
	      if (options.timeout != null) {
	        return this._startAutoCleanup();
	      }
	    }

	    disconnect(flush = true) {
	      var ref;
	      if (!this.sharedConnection) {
	        return (ref = this.connection) != null ? ref.disconnect(flush) : void 0;
	      }
	    }

	  }
	  Group.prototype.defaults = {
	    timeout: 1000 * 60 * 5,
	    connection: null,
	    Promise: Promise,
	    id: "group-key"
	  };

	  return Group;

	}).call(commonjsGlobal);

	var Group_1 = Group;

	var Batcher, Events$3, parser$4;

	parser$4 = parser;

	Events$3 = Events_1;

	Batcher = (function() {
	  class Batcher {
	    constructor(options = {}) {
	      this.options = options;
	      parser$4.load(this.options, this.defaults, this);
	      this.Events = new Events$3(this);
	      this._arr = [];
	      this._resetPromise();
	      this._lastFlush = Date.now();
	    }

	    _resetPromise() {
	      return this._promise = new this.Promise((res, rej) => {
	        return this._resolve = res;
	      });
	    }

	    _flush() {
	      clearTimeout(this._timeout);
	      this._lastFlush = Date.now();
	      this._resolve();
	      this.Events.trigger("batch", this._arr);
	      this._arr = [];
	      return this._resetPromise();
	    }

	    add(data) {
	      var ret;
	      this._arr.push(data);
	      ret = this._promise;
	      if (this._arr.length === this.maxSize) {
	        this._flush();
	      } else if ((this.maxTime != null) && this._arr.length === 1) {
	        this._timeout = setTimeout(() => {
	          return this._flush();
	        }, this.maxTime);
	      }
	      return ret;
	    }

	  }
	  Batcher.prototype.defaults = {
	    maxTime: null,
	    maxSize: null,
	    Promise: Promise
	  };

	  return Batcher;

	}).call(commonjsGlobal);

	var Batcher_1 = Batcher;

	var require$$4$1 = () => console.log('You must import the full version of Bottleneck in order to use this feature.');

	var require$$8 = getCjsExportFromNamespace(version$2);

	var Bottleneck, DEFAULT_PRIORITY$1, Events$4, Job$1, LocalDatastore$1, NUM_PRIORITIES$1, Queues$1, RedisDatastore$1, States$1, Sync$1, parser$5,
	  splice = [].splice;

	NUM_PRIORITIES$1 = 10;

	DEFAULT_PRIORITY$1 = 5;

	parser$5 = parser;

	Queues$1 = Queues_1;

	Job$1 = Job_1;

	LocalDatastore$1 = LocalDatastore_1;

	RedisDatastore$1 = require$$4$1;

	Events$4 = Events_1;

	States$1 = States_1;

	Sync$1 = Sync_1;

	Bottleneck = (function() {
	  class Bottleneck {
	    constructor(options = {}, ...invalid) {
	      var storeInstanceOptions, storeOptions;
	      this._addToQueue = this._addToQueue.bind(this);
	      this._validateOptions(options, invalid);
	      parser$5.load(options, this.instanceDefaults, this);
	      this._queues = new Queues$1(NUM_PRIORITIES$1);
	      this._scheduled = {};
	      this._states = new States$1(["RECEIVED", "QUEUED", "RUNNING", "EXECUTING"].concat(this.trackDoneStatus ? ["DONE"] : []));
	      this._limiter = null;
	      this.Events = new Events$4(this);
	      this._submitLock = new Sync$1("submit", this.Promise);
	      this._registerLock = new Sync$1("register", this.Promise);
	      storeOptions = parser$5.load(options, this.storeDefaults, {});
	      this._store = (function() {
	        if (this.datastore === "redis" || this.datastore === "ioredis" || (this.connection != null)) {
	          storeInstanceOptions = parser$5.load(options, this.redisStoreDefaults, {});
	          return new RedisDatastore$1(this, storeOptions, storeInstanceOptions);
	        } else if (this.datastore === "local") {
	          storeInstanceOptions = parser$5.load(options, this.localStoreDefaults, {});
	          return new LocalDatastore$1(this, storeOptions, storeInstanceOptions);
	        } else {
	          throw new Bottleneck.prototype.BottleneckError(`Invalid datastore type: ${this.datastore}`);
	        }
	      }).call(this);
	      this._queues.on("leftzero", () => {
	        var ref;
	        return (ref = this._store.heartbeat) != null ? typeof ref.ref === "function" ? ref.ref() : void 0 : void 0;
	      });
	      this._queues.on("zero", () => {
	        var ref;
	        return (ref = this._store.heartbeat) != null ? typeof ref.unref === "function" ? ref.unref() : void 0 : void 0;
	      });
	    }

	    _validateOptions(options, invalid) {
	      if (!((options != null) && typeof options === "object" && invalid.length === 0)) {
	        throw new Bottleneck.prototype.BottleneckError("Bottleneck v2 takes a single object argument. Refer to https://github.com/SGrondin/bottleneck#upgrading-to-v2 if you're upgrading from Bottleneck v1.");
	      }
	    }

	    ready() {
	      return this._store.ready;
	    }

	    clients() {
	      return this._store.clients;
	    }

	    channel() {
	      return `b_${this.id}`;
	    }

	    channel_client() {
	      return `b_${this.id}_${this._store.clientId}`;
	    }

	    publish(message) {
	      return this._store.__publish__(message);
	    }

	    disconnect(flush = true) {
	      return this._store.__disconnect__(flush);
	    }

	    chain(_limiter) {
	      this._limiter = _limiter;
	      return this;
	    }

	    queued(priority) {
	      return this._queues.queued(priority);
	    }

	    clusterQueued() {
	      return this._store.__queued__();
	    }

	    empty() {
	      return this.queued() === 0 && this._submitLock.isEmpty();
	    }

	    running() {
	      return this._store.__running__();
	    }

	    done() {
	      return this._store.__done__();
	    }

	    jobStatus(id) {
	      return this._states.jobStatus(id);
	    }

	    jobs(status) {
	      return this._states.statusJobs(status);
	    }

	    counts() {
	      return this._states.statusCounts();
	    }

	    _randomIndex() {
	      return Math.random().toString(36).slice(2);
	    }

	    check(weight = 1) {
	      return this._store.__check__(weight);
	    }

	    _clearGlobalState(index) {
	      if (this._scheduled[index] != null) {
	        clearTimeout(this._scheduled[index].expiration);
	        delete this._scheduled[index];
	        return true;
	      } else {
	        return false;
	      }
	    }

	    async _free(index, job, options, eventInfo) {
	      var e, running;
	      try {
	        ({running} = (await this._store.__free__(index, options.weight)));
	        this.Events.trigger("debug", `Freed ${options.id}`, eventInfo);
	        if (running === 0 && this.empty()) {
	          return this.Events.trigger("idle");
	        }
	      } catch (error1) {
	        e = error1;
	        return this.Events.trigger("error", e);
	      }
	    }

	    _run(index, job, wait) {
	      var clearGlobalState, free, run;
	      job.doRun();
	      clearGlobalState = this._clearGlobalState.bind(this, index);
	      run = this._run.bind(this, index, job);
	      free = this._free.bind(this, index, job);
	      return this._scheduled[index] = {
	        timeout: setTimeout(() => {
	          return job.doExecute(this._limiter, clearGlobalState, run, free);
	        }, wait),
	        expiration: job.options.expiration != null ? setTimeout(function() {
	          return job.doExpire(clearGlobalState, run, free);
	        }, wait + job.options.expiration) : void 0,
	        job: job
	      };
	    }

	    _drainOne(capacity) {
	      return this._registerLock.schedule(() => {
	        var args, index, next, options, queue;
	        if (this.queued() === 0) {
	          return this.Promise.resolve(null);
	        }
	        queue = this._queues.getFirst();
	        ({options, args} = next = queue.first());
	        if ((capacity != null) && options.weight > capacity) {
	          return this.Promise.resolve(null);
	        }
	        this.Events.trigger("debug", `Draining ${options.id}`, {args, options});
	        index = this._randomIndex();
	        return this._store.__register__(index, options.weight, options.expiration).then(({success, wait, reservoir}) => {
	          var empty;
	          this.Events.trigger("debug", `Drained ${options.id}`, {success, args, options});
	          if (success) {
	            queue.shift();
	            empty = this.empty();
	            if (empty) {
	              this.Events.trigger("empty");
	            }
	            if (reservoir === 0) {
	              this.Events.trigger("depleted", empty);
	            }
	            this._run(index, next, wait);
	            return this.Promise.resolve(options.weight);
	          } else {
	            return this.Promise.resolve(null);
	          }
	        });
	      });
	    }

	    _drainAll(capacity, total = 0) {
	      return this._drainOne(capacity).then((drained) => {
	        var newCapacity;
	        if (drained != null) {
	          newCapacity = capacity != null ? capacity - drained : capacity;
	          return this._drainAll(newCapacity, total + drained);
	        } else {
	          return this.Promise.resolve(total);
	        }
	      }).catch((e) => {
	        return this.Events.trigger("error", e);
	      });
	    }

	    _dropAllQueued(message) {
	      return this._queues.shiftAll(function(job) {
	        return job.doDrop({message});
	      });
	    }

	    stop(options = {}) {
	      var done, waitForExecuting;
	      options = parser$5.load(options, this.stopDefaults);
	      waitForExecuting = (at) => {
	        var finished;
	        finished = () => {
	          var counts;
	          counts = this._states.counts;
	          return (counts[0] + counts[1] + counts[2] + counts[3]) === at;
	        };
	        return new this.Promise((resolve, reject) => {
	          if (finished()) {
	            return resolve();
	          } else {
	            return this.on("done", () => {
	              if (finished()) {
	                this.removeAllListeners("done");
	                return resolve();
	              }
	            });
	          }
	        });
	      };
	      done = options.dropWaitingJobs ? (this._run = function(index, next) {
	        return next.doDrop({
	          message: options.dropErrorMessage
	        });
	      }, this._drainOne = () => {
	        return this.Promise.resolve(null);
	      }, this._registerLock.schedule(() => {
	        return this._submitLock.schedule(() => {
	          var k, ref, v;
	          ref = this._scheduled;
	          for (k in ref) {
	            v = ref[k];
	            if (this.jobStatus(v.job.options.id) === "RUNNING") {
	              clearTimeout(v.timeout);
	              clearTimeout(v.expiration);
	              v.job.doDrop({
	                message: options.dropErrorMessage
	              });
	            }
	          }
	          this._dropAllQueued(options.dropErrorMessage);
	          return waitForExecuting(0);
	        });
	      })) : this.schedule({
	        priority: NUM_PRIORITIES$1 - 1,
	        weight: 0
	      }, () => {
	        return waitForExecuting(1);
	      });
	      this._receive = function(job) {
	        return job._reject(new Bottleneck.prototype.BottleneckError(options.enqueueErrorMessage));
	      };
	      this.stop = () => {
	        return this.Promise.reject(new Bottleneck.prototype.BottleneckError("stop() has already been called"));
	      };
	      return done;
	    }

	    async _addToQueue(job) {
	      var args, blocked, error, options, reachedHWM, shifted, strategy;
	      ({args, options} = job);
	      try {
	        ({reachedHWM, blocked, strategy} = (await this._store.__submit__(this.queued(), options.weight)));
	      } catch (error1) {
	        error = error1;
	        this.Events.trigger("debug", `Could not queue ${options.id}`, {args, options, error});
	        job.doDrop({error});
	        return false;
	      }
	      if (blocked) {
	        job.doDrop();
	        return true;
	      } else if (reachedHWM) {
	        shifted = strategy === Bottleneck.prototype.strategy.LEAK ? this._queues.shiftLastFrom(options.priority) : strategy === Bottleneck.prototype.strategy.OVERFLOW_PRIORITY ? this._queues.shiftLastFrom(options.priority + 1) : strategy === Bottleneck.prototype.strategy.OVERFLOW ? job : void 0;
	        if (shifted != null) {
	          shifted.doDrop();
	        }
	        if ((shifted == null) || strategy === Bottleneck.prototype.strategy.OVERFLOW) {
	          if (shifted == null) {
	            job.doDrop();
	          }
	          return reachedHWM;
	        }
	      }
	      job.doQueue(reachedHWM, blocked);
	      this._queues.push(job);
	      await this._drainAll();
	      return reachedHWM;
	    }

	    _receive(job) {
	      if (this._states.jobStatus(job.options.id) != null) {
	        job._reject(new Bottleneck.prototype.BottleneckError(`A job with the same id already exists (id=${job.options.id})`));
	        return false;
	      } else {
	        job.doReceive();
	        return this._submitLock.schedule(this._addToQueue, job);
	      }
	    }

	    submit(...args) {
	      var cb, fn, job, options, ref, ref1, task;
	      if (typeof args[0] === "function") {
	        ref = args, [fn, ...args] = ref, [cb] = splice.call(args, -1);
	        options = parser$5.load({}, this.jobDefaults);
	      } else {
	        ref1 = args, [options, fn, ...args] = ref1, [cb] = splice.call(args, -1);
	        options = parser$5.load(options, this.jobDefaults);
	      }
	      task = (...args) => {
	        return new this.Promise(function(resolve, reject) {
	          return fn(...args, function(...args) {
	            return (args[0] != null ? reject : resolve)(args);
	          });
	        });
	      };
	      job = new Job$1(task, args, options, this.jobDefaults, this.rejectOnDrop, this.Events, this._states, this.Promise);
	      job.promise.then(function(args) {
	        return typeof cb === "function" ? cb(...args) : void 0;
	      }).catch(function(args) {
	        if (Array.isArray(args)) {
	          return typeof cb === "function" ? cb(...args) : void 0;
	        } else {
	          return typeof cb === "function" ? cb(args) : void 0;
	        }
	      });
	      return this._receive(job);
	    }

	    schedule(...args) {
	      var job, options, task;
	      if (typeof args[0] === "function") {
	        [task, ...args] = args;
	        options = {};
	      } else {
	        [options, task, ...args] = args;
	      }
	      job = new Job$1(task, args, options, this.jobDefaults, this.rejectOnDrop, this.Events, this._states, this.Promise);
	      this._receive(job);
	      return job.promise;
	    }

	    wrap(fn) {
	      var schedule, wrapped;
	      schedule = this.schedule.bind(this);
	      wrapped = function(...args) {
	        return schedule(fn.bind(this), ...args);
	      };
	      wrapped.withOptions = function(options, ...args) {
	        return schedule(options, fn, ...args);
	      };
	      return wrapped;
	    }

	    async updateSettings(options = {}) {
	      await this._store.__updateSettings__(parser$5.overwrite(options, this.storeDefaults));
	      parser$5.overwrite(options, this.instanceDefaults, this);
	      return this;
	    }

	    currentReservoir() {
	      return this._store.__currentReservoir__();
	    }

	    incrementReservoir(incr = 0) {
	      return this._store.__incrementReservoir__(incr);
	    }

	  }
	  Bottleneck.default = Bottleneck;

	  Bottleneck.Events = Events$4;

	  Bottleneck.version = Bottleneck.prototype.version = require$$8.version;

	  Bottleneck.strategy = Bottleneck.prototype.strategy = {
	    LEAK: 1,
	    OVERFLOW: 2,
	    OVERFLOW_PRIORITY: 4,
	    BLOCK: 3
	  };

	  Bottleneck.BottleneckError = Bottleneck.prototype.BottleneckError = BottleneckError_1;

	  Bottleneck.Group = Bottleneck.prototype.Group = Group_1;

	  Bottleneck.RedisConnection = Bottleneck.prototype.RedisConnection = require$$2;

	  Bottleneck.IORedisConnection = Bottleneck.prototype.IORedisConnection = require$$3;

	  Bottleneck.Batcher = Bottleneck.prototype.Batcher = Batcher_1;

	  Bottleneck.prototype.jobDefaults = {
	    priority: DEFAULT_PRIORITY$1,
	    weight: 1,
	    expiration: null,
	    id: "<no-id>"
	  };

	  Bottleneck.prototype.storeDefaults = {
	    maxConcurrent: null,
	    minTime: 0,
	    highWater: null,
	    strategy: Bottleneck.prototype.strategy.LEAK,
	    penalty: null,
	    reservoir: null,
	    reservoirRefreshInterval: null,
	    reservoirRefreshAmount: null,
	    reservoirIncreaseInterval: null,
	    reservoirIncreaseAmount: null,
	    reservoirIncreaseMaximum: null
	  };

	  Bottleneck.prototype.localStoreDefaults = {
	    Promise: Promise,
	    timeout: null,
	    heartbeatInterval: 250
	  };

	  Bottleneck.prototype.redisStoreDefaults = {
	    Promise: Promise,
	    timeout: null,
	    heartbeatInterval: 5000,
	    clientTimeout: 10000,
	    Redis: null,
	    clientOptions: {},
	    clusterNodes: null,
	    clearDatastore: false,
	    connection: null
	  };

	  Bottleneck.prototype.instanceDefaults = {
	    datastore: "local",
	    connection: null,
	    id: "<no-id>",
	    rejectOnDrop: true,
	    trackDoneStatus: false,
	    Promise: Promise
	  };

	  Bottleneck.prototype.stopDefaults = {
	    enqueueErrorMessage: "This limiter has been stopped and cannot accept new jobs.",
	    dropWaitingJobs: true,
	    dropErrorMessage: "This limiter has been stopped."
	  };

	  return Bottleneck;

	}).call(commonjsGlobal);

	var Bottleneck_1 = Bottleneck;

	var lib = Bottleneck_1;

	return lib;

})));


/***/ })

/******/ });
/************************************************************************/
/******/ // The module cache
/******/ var __webpack_module_cache__ = {};
/******/ 
/******/ // The require function
/******/ function __nccwpck_require__(moduleId) {
/******/ 	// Check if module is in cache
/******/ 	var cachedModule = __webpack_module_cache__[moduleId];
/******/ 	if (cachedModule !== undefined) {
/******/ 		return cachedModule.exports;
/******/ 	}
/******/ 	// Create a new module (and put it into the cache)
/******/ 	var module = __webpack_module_cache__[moduleId] = {
/******/ 		// no module.id needed
/******/ 		// no module.loaded needed
/******/ 		exports: {}
/******/ 	};
/******/ 
/******/ 	// Execute the module function
/******/ 	var threw = true;
/******/ 	try {
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 		threw = false;
/******/ 	} finally {
/******/ 		if(threw) delete __webpack_module_cache__[moduleId];
/******/ 	}
/******/ 
/******/ 	// Return the exports of the module
/******/ 	return module.exports;
/******/ }
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/asset-relocator-loader */
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = decodeURIComponent(new URL('.', import.meta.url).pathname).slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

;// CONCATENATED MODULE: ./tidy-core/src/inputs.ts
/** An invalid input; the message names the input and the value it got. */
class InputError extends Error {
}
/**
 * The raw value of an input: the runner sets `INPUT_<NAME>` with the name
 * upper-cased and `-` kept.
 */
function rawInput(env, name) {
    return env[`INPUT_${name.toUpperCase()}`];
}
/** A non-empty input, trimmed. Throws {@link InputError} when it is missing or blank. */
function requiredString(env, name) {
    const value = (rawInput(env, name) ?? "").trim();
    if (value === "") {
        throw new InputError(`${name} is required, got an empty value`);
    }
    return value;
}
/** The input as it was set (not trimmed), or `fallback` when the runner did not set it. */
function optionalString(env, name, fallback) {
    return rawInput(env, name) ?? fallback;
}
/**
 * `true` or `false` and nothing else (surrounding whitespace is ignored);
 * `fallback` when the input is not set. Throws {@link InputError} on any
 * other value.
 */
function parseBoolean(env, name, fallback) {
    const raw = rawInput(env, name);
    if (raw === undefined)
        return fallback;
    const value = raw.trim();
    if (value === "true")
        return true;
    if (value === "false")
        return false;
    throw new InputError(`${name} must be "true" or "false", got ${JSON.stringify(raw)}`);
}
/**
 * A whole number of at least `min` (digits only, surrounding whitespace is
 * ignored). Throws {@link InputError} when the input is missing, not a whole
 * number or below `min`.
 */
function parseWholeNumber(env, name, min) {
    const raw = rawInput(env, name);
    const value = (raw ?? "").trim();
    const number = /^[0-9]+$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(number) || number < min) {
        throw new InputError(`${name} must be a whole number >= ${String(min)}, got ${JSON.stringify(raw ?? "")}`);
    }
    return number;
}

;// CONCATENATED MODULE: ./tidy-core/src/output.ts
/** The default sink: one line on stdout. */
const stdoutSink = (line) => {
    process.stdout.write(`${line}\n`);
};
/** Escapes the message of a workflow command (`::name::message`). */
function escapeCommandData(text) {
    return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
/** Plain lines and `::notice::`, `::warning::` and `::error::` commands, all through `sink` (default stdout). */
function createOutput(sink = stdoutSink) {
    return {
        log: sink,
        notice: (message) => sink(`::notice::${escapeCommandData(message)}`),
        warning: (message) => sink(`::warning::${escapeCommandData(message)}`),
        error: (message) => sink(`::error::${escapeCommandData(message)}`),
    };
}

;// CONCATENATED MODULE: ./tidy-core/src/errors.ts
/** The HTTP status of an Octokit error, or `undefined` for any other error. */
function statusOf(err) {
    if (typeof err === "object" && err !== null && "status" in err) {
        const status = err.status;
        if (typeof status === "number")
            return status;
    }
    return undefined;
}
/** The error's message, prefixed with `HTTP <status>: ` when it carries a status. */
function describeError(err) {
    const status = statusOf(err);
    const message = err instanceof Error ? err.message : String(err);
    return status !== undefined ? `HTTP ${String(status)}: ${message}` : message;
}

;// CONCATENATED MODULE: external "node:fs/promises"
const promises_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs/promises");
;// CONCATENATED MODULE: ./tidy-core/src/summary.ts


/**
 * Appends `markdown` and a newline to the file `GITHUB_STEP_SUMMARY` names.
 * Does nothing when `path` is unset or empty. A write failure never fails
 * the run: it is reported through `warning` only.
 */
async function appendStepSummary(path, markdown, warning) {
    if (!path)
        return;
    try {
        await (0,promises_namespaceObject.appendFile)(path, `${markdown}\n`, "utf8");
    }
    catch (err) {
        warning(`Could not write the step summary: ${describeError(err)}`);
    }
}

;// CONCATENATED MODULE: ./registry/manifest.ts


const OCI_INDEX = "application/vnd.oci.image.index.v1+json";
const OCI_MANIFEST = "application/vnd.oci.image.manifest.v1+json";
const DOCKER_MANIFEST_LIST = "application/vnd.docker.distribution.manifest.list.v2+json";
const DOCKER_MANIFEST_V2 = "application/vnd.docker.distribution.manifest.v2+json";
/** Accept header sent when resolving a manifest: every media type the registry core understands. */
const MANIFEST_ACCEPT_HEADER = [
    OCI_INDEX,
    OCI_MANIFEST,
    DOCKER_MANIFEST_LIST,
    DOCKER_MANIFEST_V2,
].join(", ");
const INDEX_MEDIA_TYPES = new Set([OCI_INDEX, DOCKER_MANIFEST_LIST]);
/** The annotation GHCR sets on a buildx provenance/attestation child of a multi-arch index. */
const ATTESTATION_ANNOTATION_KEY = "vnd.docker.reference.type";
const ATTESTATION_ANNOTATION_VALUE = "attestation-manifest";
/**
 * Whether a child is GHCR's buildx provenance/attestation manifest rather
 * than a platform image. Verified against the live registry (2026-09):
 * these are ordinary index children carrying
 * `annotations["vnd.docker.reference.type"] === "attestation-manifest"`;
 * NOT something returned by the `/v2/<img>/referrers/<digest>` endpoint,
 * which returns 0 results for these. Do not build referrers-API logic to
 * find them; they are already covered by index-children traversal.
 */
function isAttestationChild(child) {
    return child.annotations?.[ATTESTATION_ANNOTATION_KEY] === ATTESTATION_ANNOTATION_VALUE;
}
/**
 * Parses a manifest response body into its media type and (for an index)
 * its direct children. Pure, no I/O; this is the media-type dispatch and
 * child-extraction logic, kept separate from the network call so it can be
 * unit tested against fixture bodies without mocking `fetch`.
 *
 * A flat manifest (OCI manifest, Docker v2 manifest) has no children: the
 * caller sees `children: []`, matching a package like `buildcache` whose
 * tagged versions are plain manifests with zero fan-out.
 */
function parseManifestBody(bodyText, headerMediaType) {
    let parsed;
    try {
        parsed = JSON.parse(bodyText);
    }
    catch {
        return { mediaType: headerMediaType ?? "unknown", children: [] };
    }
    const mediaType = parsed.mediaType ?? headerMediaType ?? "unknown";
    if (!INDEX_MEDIA_TYPES.has(mediaType) || !Array.isArray(parsed.manifests)) {
        return { mediaType, children: [] };
    }
    const children = parsed.manifests.map((m) => ({
        digest: m.digest,
        ...(m.mediaType !== undefined && { mediaType: m.mediaType }),
        ...(m.size !== undefined && { size: m.size }),
        ...(m.platform !== undefined && { platform: m.platform }),
        ...(m.annotations !== undefined && { annotations: m.annotations }),
    }));
    return { mediaType, children };
}
/**
 * Resolves a manifest by digest or tag against `https://ghcr.io/v2/<registryPath>/manifests/<reference>`.
 *
 * The observed HTTP status is always recorded on the result (via `httpStatus`
 * on every branch except `network-error`), so callers can distinguish a 404
 * (genuinely dead child; safe to treat as unreachable) from a 429/5xx that
 * survived retries (transient; must NOT be treated as dead; the bash
 * predecessor that dropped this distinction could not explain why a
 * descendant failed to resolve).
 */
async function resolveManifest(registryPath, token, reference, options = {}) {
    const url = `https://ghcr.io/v2/${registryPath}/manifests/${reference}`;
    const outcome = await requestWithRetry(url, { headers: { Authorization: `Bearer ${token}`, Accept: MANIFEST_ACCEPT_HEADER } }, options);
    if (outcome.kind === "network-error") {
        return { status: "network-error" };
    }
    const cls = classifyStatus(outcome.status);
    if (cls === "not-found") {
        return { status: "not-found", httpStatus: 404 };
    }
    if (cls === "transient") {
        return { status: "transient-error", httpStatus: outcome.status };
    }
    if (cls === "client-error") {
        return { status: "client-error", httpStatus: outcome.status };
    }
    const digestHeader = outcome.headers.get("docker-content-digest") ?? reference;
    const { mediaType, children } = parseManifestBody(outcome.bodyText, outcome.headers.get("content-type") ?? undefined);
    return {
        status: "success",
        httpStatus: outcome.status,
        digest: digestHeader,
        mediaType,
        children,
    };
}

;// CONCATENATED MODULE: ./registry/auth.ts
class RegistryAuthError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
        this.name = "RegistryAuthError";
    }
}
function createInMemoryTokenCache() {
    const store = new Map();
    return {
        get: (scope) => store.get(scope),
        set: (scope, token) => {
            store.set(scope, token);
        },
    };
}
/**
 * Exchanges a GitHub token for a GHCR registry bearer token scoped to
 * `repository:<packageName>:pull`. Results are cached per scope when a
 * `cache` is supplied (recommended for any caller resolving more than one
 * manifest for the same package).
 */
async function getRegistryToken(githubToken, name, options = {}) {
    const scope = `repository:${name}:pull`;
    const cached = options.cache?.get(scope);
    if (cached !== undefined) {
        return cached;
    }
    const fetchImpl = options.fetchImpl ?? fetch;
    const url = `https://ghcr.io/token?scope=${encodeURIComponent(scope)}&service=ghcr.io`;
    const basicAuth = Buffer.from(`token:${githubToken}`, "utf8").toString("base64");
    const res = await fetchImpl(url, { headers: { Authorization: `Basic ${basicAuth}` } });
    if (res.status !== 200) {
        throw new RegistryAuthError(`failed to obtain registry token for scope "${scope}": HTTP ${res.status}`, res.status);
    }
    const body = (await res.json());
    if (!body.token) {
        throw new RegistryAuthError(`registry token response for scope "${scope}" is missing "token"`, res.status);
    }
    options.cache?.set(scope, body.token);
    return body.token;
}

;// CONCATENATED MODULE: ./node_modules/universal-user-agent/index.js
function getUserAgent() {
  if (typeof navigator === "object" && "userAgent" in navigator) {
    return navigator.userAgent;
  }

  if (typeof process === "object" && process.version !== undefined) {
    return `Node.js/${process.version.substr(1)} (${process.platform}; ${
      process.arch
    })`;
  }

  return "<environment undetectable>";
}

;// CONCATENATED MODULE: ./node_modules/before-after-hook/lib/register.js
// @ts-check

function register(state, name, method, options) {
  if (typeof method !== "function") {
    throw new Error("method for before hook must be a function");
  }

  if (!options) {
    options = {};
  }

  if (Array.isArray(name)) {
    return name.reverse().reduce((callback, name) => {
      return register.bind(null, state, name, callback, options);
    }, method)();
  }

  return Promise.resolve().then(() => {
    if (!state.registry[name]) {
      return method(options);
    }

    return state.registry[name].reduce((method, registered) => {
      return registered.hook.bind(null, method, options);
    }, method)();
  });
}

;// CONCATENATED MODULE: ./node_modules/before-after-hook/lib/add.js
// @ts-check

function addHook(state, kind, name, hook) {
  const orig = hook;
  if (!state.registry[name]) {
    state.registry[name] = [];
  }

  if (kind === "before") {
    hook = (method, options) => {
      return Promise.resolve()
        .then(orig.bind(null, options))
        .then(method.bind(null, options));
    };
  }

  if (kind === "after") {
    hook = (method, options) => {
      let result;
      return Promise.resolve()
        .then(method.bind(null, options))
        .then((result_) => {
          result = result_;
          return orig(result, options);
        })
        .then(() => {
          return result;
        });
    };
  }

  if (kind === "error") {
    hook = (method, options) => {
      return Promise.resolve()
        .then(method.bind(null, options))
        .catch((error) => {
          return orig(error, options);
        });
    };
  }

  state.registry[name].push({
    hook: hook,
    orig: orig,
  });
}

;// CONCATENATED MODULE: ./node_modules/before-after-hook/lib/remove.js
// @ts-check

function removeHook(state, name, method) {
  if (!state.registry[name]) {
    return;
  }

  const index = state.registry[name]
    .map((registered) => {
      return registered.orig;
    })
    .indexOf(method);

  if (index === -1) {
    return;
  }

  state.registry[name].splice(index, 1);
}

;// CONCATENATED MODULE: ./node_modules/before-after-hook/index.js
// @ts-check





// bind with array of arguments: https://stackoverflow.com/a/21792913
const bind = Function.bind;
const bindable = bind.bind(bind);

function bindApi(hook, state, name) {
  const removeHookRef = bindable(removeHook, null).apply(
    null,
    name ? [state, name] : [state]
  );
  hook.api = { remove: removeHookRef };
  hook.remove = removeHookRef;
  ["before", "error", "after", "wrap"].forEach((kind) => {
    const args = name ? [state, kind, name] : [state, kind];
    hook[kind] = hook.api[kind] = bindable(addHook, null).apply(null, args);
  });
}

function Singular() {
  const singularHookName = Symbol("Singular");
  const singularHookState = {
    registry: {},
  };
  const singularHook = register.bind(null, singularHookState, singularHookName);
  bindApi(singularHook, singularHookState, singularHookName);
  return singularHook;
}

function Collection() {
  const state = {
    registry: {},
  };

  const hook = register.bind(null, state);
  bindApi(hook, state);

  return hook;
}

/* harmony default export */ const before_after_hook = ({ Singular, Collection });

;// CONCATENATED MODULE: ./node_modules/@octokit/endpoint/dist-bundle/index.js
// pkg/dist-src/defaults.js


// pkg/dist-src/version.js
var VERSION = "0.0.0-development";

// pkg/dist-src/defaults.js
var userAgent = `octokit-endpoint.js/${VERSION} ${getUserAgent()}`;
var DEFAULTS = {
  method: "GET",
  baseUrl: "https://api.github.com",
  headers: {
    accept: "application/vnd.github.v3+json",
    "user-agent": userAgent
  },
  mediaType: {
    format: ""
  }
};

// pkg/dist-src/util/lowercase-keys.js
function lowercaseKeys(object) {
  if (!object) {
    return {};
  }
  return Object.keys(object).reduce((newObj, key) => {
    newObj[key.toLowerCase()] = object[key];
    return newObj;
  }, {});
}

// pkg/dist-src/util/is-plain-object.js
function isPlainObject(value) {
  if (typeof value !== "object" || value === null) return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const Ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return typeof Ctor === "function" && Ctor instanceof Ctor && Function.prototype.call(Ctor) === Function.prototype.call(value);
}

// pkg/dist-src/util/merge-deep.js
function mergeDeep(defaults, options) {
  const result = Object.assign({}, defaults);
  Object.keys(options).forEach((key) => {
    if (isPlainObject(options[key])) {
      if (!(key in defaults)) Object.assign(result, { [key]: options[key] });
      else result[key] = mergeDeep(defaults[key], options[key]);
    } else {
      Object.assign(result, { [key]: options[key] });
    }
  });
  return result;
}

// pkg/dist-src/util/remove-undefined-properties.js
function removeUndefinedProperties(obj) {
  for (const key in obj) {
    if (obj[key] === void 0) {
      delete obj[key];
    }
  }
  return obj;
}

// pkg/dist-src/merge.js
function merge(defaults, route, options) {
  if (typeof route === "string") {
    let [method, url] = route.split(" ");
    options = Object.assign(url ? { method, url } : { url: method }, options);
  } else {
    options = Object.assign({}, route);
  }
  options.headers = lowercaseKeys(options.headers);
  removeUndefinedProperties(options);
  removeUndefinedProperties(options.headers);
  const mergedOptions = mergeDeep(defaults || {}, options);
  if (options.url === "/graphql") {
    if (defaults && defaults.mediaType.previews?.length) {
      mergedOptions.mediaType.previews = defaults.mediaType.previews.filter(
        (preview) => !mergedOptions.mediaType.previews.includes(preview)
      ).concat(mergedOptions.mediaType.previews);
    }
    mergedOptions.mediaType.previews = (mergedOptions.mediaType.previews || []).map((preview) => preview.replace(/-preview/, ""));
  }
  return mergedOptions;
}

// pkg/dist-src/util/add-query-parameters.js
function addQueryParameters(url, parameters) {
  const separator = /\?/.test(url) ? "&" : "?";
  const names = Object.keys(parameters);
  if (names.length === 0) {
    return url;
  }
  return url + separator + names.map((name) => {
    if (name === "q") {
      return "q=" + parameters.q.split("+").map(encodeURIComponent).join("+");
    }
    return `${name}=${encodeURIComponent(parameters[name])}`;
  }).join("&");
}

// pkg/dist-src/util/extract-url-variable-names.js
var urlVariableRegex = /\{[^{}}]+\}/g;
function removeNonChars(variableName) {
  return variableName.replace(/(?:^\W+)|(?:(?<!\W)\W+$)/g, "").split(/,/);
}
function extractUrlVariableNames(url) {
  const matches = url.match(urlVariableRegex);
  if (!matches) {
    return [];
  }
  return matches.map(removeNonChars).reduce((a, b) => a.concat(b), []);
}

// pkg/dist-src/util/omit.js
function omit(object, keysToOmit) {
  const result = { __proto__: null };
  for (const key of Object.keys(object)) {
    if (keysToOmit.indexOf(key) === -1) {
      result[key] = object[key];
    }
  }
  return result;
}

// pkg/dist-src/util/url-template.js
function encodeReserved(str) {
  return str.split(/(%[0-9A-Fa-f]{2})/g).map(function(part) {
    if (!/%[0-9A-Fa-f]/.test(part)) {
      part = encodeURI(part).replace(/%5B/g, "[").replace(/%5D/g, "]");
    }
    return part;
  }).join("");
}
function encodeUnreserved(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, function(c) {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase();
  });
}
function encodeValue(operator, value, key) {
  value = operator === "+" || operator === "#" ? encodeReserved(value) : encodeUnreserved(value);
  if (key) {
    return encodeUnreserved(key) + "=" + value;
  } else {
    return value;
  }
}
function isDefined(value) {
  return value !== void 0 && value !== null;
}
function isKeyOperator(operator) {
  return operator === ";" || operator === "&" || operator === "?";
}
function getValues(context, operator, key, modifier) {
  var value = context[key], result = [];
  if (isDefined(value) && value !== "") {
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
      value = value.toString();
      if (modifier && modifier !== "*") {
        value = value.substring(0, parseInt(modifier, 10));
      }
      result.push(
        encodeValue(operator, value, isKeyOperator(operator) ? key : "")
      );
    } else {
      if (modifier === "*") {
        if (Array.isArray(value)) {
          value.filter(isDefined).forEach(function(value2) {
            result.push(
              encodeValue(operator, value2, isKeyOperator(operator) ? key : "")
            );
          });
        } else {
          Object.keys(value).forEach(function(k) {
            if (isDefined(value[k])) {
              result.push(encodeValue(operator, value[k], k));
            }
          });
        }
      } else {
        const tmp = [];
        if (Array.isArray(value)) {
          value.filter(isDefined).forEach(function(value2) {
            tmp.push(encodeValue(operator, value2));
          });
        } else {
          Object.keys(value).forEach(function(k) {
            if (isDefined(value[k])) {
              tmp.push(encodeUnreserved(k));
              tmp.push(encodeValue(operator, value[k].toString()));
            }
          });
        }
        if (isKeyOperator(operator)) {
          result.push(encodeUnreserved(key) + "=" + tmp.join(","));
        } else if (tmp.length !== 0) {
          result.push(tmp.join(","));
        }
      }
    }
  } else {
    if (operator === ";") {
      if (isDefined(value)) {
        result.push(encodeUnreserved(key));
      }
    } else if (value === "" && (operator === "&" || operator === "?")) {
      result.push(encodeUnreserved(key) + "=");
    } else if (value === "") {
      result.push("");
    }
  }
  return result;
}
function parseUrl(template) {
  return {
    expand: expand.bind(null, template)
  };
}
function expand(template, context) {
  var operators = ["+", "#", ".", "/", ";", "?", "&"];
  template = template.replace(
    /\{([^\{\}]+)\}|([^\{\}]+)/g,
    function(_, expression, literal) {
      if (expression) {
        let operator = "";
        const values = [];
        if (operators.indexOf(expression.charAt(0)) !== -1) {
          operator = expression.charAt(0);
          expression = expression.substr(1);
        }
        expression.split(/,/g).forEach(function(variable) {
          var tmp = /([^:\*]*)(?::(\d+)|(\*))?/.exec(variable);
          values.push(getValues(context, operator, tmp[1], tmp[2] || tmp[3]));
        });
        if (operator && operator !== "+") {
          var separator = ",";
          if (operator === "?") {
            separator = "&";
          } else if (operator !== "#") {
            separator = operator;
          }
          return (values.length !== 0 ? operator : "") + values.join(separator);
        } else {
          return values.join(",");
        }
      } else {
        return encodeReserved(literal);
      }
    }
  );
  if (template === "/") {
    return template;
  } else {
    return template.replace(/\/$/, "");
  }
}

// pkg/dist-src/parse.js
function parse(options) {
  let method = options.method.toUpperCase();
  let url = (options.url || "/").replace(/:([a-z]\w+)/g, "{$1}");
  let headers = Object.assign({}, options.headers);
  let body;
  let parameters = omit(options, [
    "method",
    "baseUrl",
    "url",
    "headers",
    "request",
    "mediaType"
  ]);
  const urlVariableNames = extractUrlVariableNames(url);
  url = parseUrl(url).expand(parameters);
  if (!/^http/.test(url)) {
    url = options.baseUrl + url;
  }
  const omittedParameters = Object.keys(options).filter((option) => urlVariableNames.includes(option)).concat("baseUrl");
  const remainingParameters = omit(parameters, omittedParameters);
  const isBinaryRequest = /application\/octet-stream/i.test(headers.accept);
  if (!isBinaryRequest) {
    if (options.mediaType.format) {
      headers.accept = headers.accept.split(/,/).map(
        (format) => format.replace(
          /application\/vnd(\.\w+)(\.v3)?(\.\w+)?(\+json)?$/,
          `application/vnd$1$2.${options.mediaType.format}`
        )
      ).join(",");
    }
    if (url.endsWith("/graphql")) {
      if (options.mediaType.previews?.length) {
        const previewsFromAcceptHeader = headers.accept.match(/(?<![\w-])[\w-]+(?=-preview)/g) || [];
        headers.accept = previewsFromAcceptHeader.concat(options.mediaType.previews).map((preview) => {
          const format = options.mediaType.format ? `.${options.mediaType.format}` : "+json";
          return `application/vnd.github.${preview}-preview${format}`;
        }).join(",");
      }
    }
  }
  if (["GET", "HEAD"].includes(method)) {
    url = addQueryParameters(url, remainingParameters);
  } else {
    if ("data" in remainingParameters) {
      body = remainingParameters.data;
    } else {
      if (Object.keys(remainingParameters).length) {
        body = remainingParameters;
      }
    }
  }
  if (!headers["content-type"] && typeof body !== "undefined") {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  if (["PATCH", "PUT"].includes(method) && typeof body === "undefined") {
    body = "";
  }
  return Object.assign(
    { method, url, headers },
    typeof body !== "undefined" ? { body } : null,
    options.request ? { request: options.request } : null
  );
}

// pkg/dist-src/endpoint-with-defaults.js
function endpointWithDefaults(defaults, route, options) {
  return parse(merge(defaults, route, options));
}

// pkg/dist-src/with-defaults.js
function withDefaults(oldDefaults, newDefaults) {
  const DEFAULTS2 = merge(oldDefaults, newDefaults);
  const endpoint2 = endpointWithDefaults.bind(null, DEFAULTS2);
  return Object.assign(endpoint2, {
    DEFAULTS: DEFAULTS2,
    defaults: withDefaults.bind(null, DEFAULTS2),
    merge: merge.bind(null, DEFAULTS2),
    parse
  });
}

// pkg/dist-src/index.js
var endpoint = withDefaults(null, DEFAULTS);


;// CONCATENATED MODULE: ./node_modules/content-type/dist/index.js
/*!
 * content-type
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
const SP = 32; // " "
const HTAB = 9; // "\t"
const SEMI = 59; // ";"
const EQ = 61; // "="
const DQUOTE = 34; // '"'
const BSLASH = 92; // "\\"
const COMMA = 44; // ","
const LOWER_CASE = 1;
const OWS = 2;
const SEMI_FLAG = 4;
const COMMA_FLAG = 8;
const TOKEN_FLAG = 16;
const NON_ASCII = 0xff00;
const CASE_FLAGS = LOWER_CASE | NON_ASCII;
/**
 * Character flags used to normalize HTTP field values while scanning.
 * Out-of-range reads intentionally coerce to zero in bitwise expressions.
 */
const CHAR_MAP = new Uint8Array(0x100);
CHAR_MAP[HTAB] |= OWS;
CHAR_MAP[SP] |= OWS;
CHAR_MAP[SEMI] |= SEMI_FLAG;
CHAR_MAP[COMMA] |= COMMA_FLAG;
for (let code = 0x80 /* non-ASCII */; code <= 0xff; code++) {
    CHAR_MAP[code] |= LOWER_CASE;
}
for (const char of "!#$%&'*+-.^_`|~") {
    CHAR_MAP[char.charCodeAt(0)] |= TOKEN_FLAG;
}
for (let code = 0x30 /* 0 */; code <= 0x39 /* 9 */; code++) {
    CHAR_MAP[code] |= TOKEN_FLAG;
}
for (let code = 0x41 /* A */; code <= 0x5a /* Z */; code++) {
    CHAR_MAP[code] |= LOWER_CASE | TOKEN_FLAG;
}
for (let code = 0x61 /* a */; code <= 0x7a /* z */; code++) {
    CHAR_MAP[code] |= TOKEN_FLAG;
}
/**
 * Null object perf optimization. Faster than `Object.create(null)` and `{ __proto__: null }`.
 */
const NullObject = /* @__PURE__ */ (() => {
    const C = function () { };
    C.prototype = Object.create(null);
    return C;
})();
/**
 * Validate a type string against RFC 9110.
 */
function isTypeValid(type) {
    const len = type.length;
    let hasSlash = false;
    for (let index = 0; index < len; index++) {
        const code = type.charCodeAt(index);
        if (code === 47 /* / */) {
            if (hasSlash || index === 0 || index === len - 1)
                return false;
            hasSlash = true;
        }
        else if (!isTokenCode(code)) {
            return false;
        }
    }
    return hasSlash;
}
/**
 * Validate a token against RFC 9110.
 */
function isTokenValid(name) {
    const len = name.length;
    if (len === 0)
        return false;
    for (let index = 0; index < len; index++) {
        if (!isTokenCode(name.charCodeAt(index)))
            return false;
    }
    return true;
}
/**
 * Check whether a character code belongs to the token production in RFC 9110.
 */
function isTokenCode(code) {
    return (CHAR_MAP[code] & TOKEN_FLAG) !== 0;
}
/**
 * Serialize a parameter value.
 */
function parameterValue(str) {
    const len = str.length;
    if (len === 0)
        return '""';
    let index = 0;
    while (index < len && isTokenCode(str.charCodeAt(index)))
        index++;
    if (index === len)
        return str;
    let result = '"';
    let start = 0;
    while (index < len) {
        const code = str.charCodeAt(index);
        if (code !== HTAB && (code < SP || code === 127 || code > 255)) {
            throw new TypeError(`Invalid parameter value: ${str}`);
        }
        if (code === 34 /* " */ || code === 92 /* \\ */) {
            result += `${str.slice(start, index)}\\`;
            start = index;
        }
        index++;
    }
    return `${result}${str.slice(start)}"`;
}
/**
 * Format an object into a `Content-Type` header.
 */
function format(obj) {
    const { type, parameters } = obj;
    if (!type || !isTypeValid(type)) {
        throw new TypeError(`Invalid type: ${type}`);
    }
    let result = type;
    if (parameters) {
        for (const param of Object.keys(parameters)) {
            if (!isTokenValid(param)) {
                throw new TypeError(`Invalid parameter name: ${param}`);
            }
            result += `; ${param}=${parameterValue(parameters[param])}`;
        }
    }
    return result;
}
/**
 * Parse a `Content-Type` header.
 */
function dist_parse(header, options) {
    const stopFlags = SEMI_FLAG | (options?.comma === true ? COMMA_FLAG : 0);
    const len = header.length;
    let valueStart = options?.start ?? 0;
    while ((CHAR_MAP[header.charCodeAt(valueStart)] & OWS) !== 0) {
        valueStart++;
    }
    let index = valueStart;
    let typeFlags = 0;
    let whitespace = -1;
    let stop = options?.parameters === false ? COMMA_FLAG : 0;
    while (index < len) {
        const code = header.charCodeAt(index);
        const flags = CHAR_MAP[code];
        if ((flags & stopFlags) !== 0) {
            stop |= flags & COMMA_FLAG;
            break;
        }
        if ((flags & OWS) !== 0) {
            if (whitespace === -1)
                whitespace = index;
        }
        else {
            whitespace = -1;
        }
        typeFlags |= (code & NON_ASCII) | flags;
        index++;
    }
    const valueEnd = whitespace === -1 ? index : whitespace;
    const value = header.slice(valueStart, valueEnd);
    const type = (typeFlags & CASE_FLAGS) === 0 ? value : value.toLowerCase();
    if (index === len || stop !== 0) {
        return { type, index, parameters: new NullObject() };
    }
    return parseParameters(header, type, index, len, stopFlags);
}
/**
 * Parses the parameters of a `Content-Type` header starting at the given index.
 */
function parseParameters(header, type, index, len, stopFlags) {
    const parameters = new NullObject();
    parameter: while (index < len) {
        index++; // Skip over ;
        while ((CHAR_MAP[header.charCodeAt(index)] & OWS) !== 0) {
            index++;
        }
        const keyStart = index;
        let keyFlags = 0;
        let keyWhitespace = -1;
        while (index < len) {
            const code = header.charCodeAt(index);
            const flags = CHAR_MAP[code];
            if ((flags & stopFlags) !== 0) {
                if ((flags & COMMA_FLAG) !== 0)
                    break parameter;
                continue parameter;
            }
            if (code === EQ) {
                const keyEnd = keyWhitespace === -1 ? index : keyWhitespace;
                const value = header.slice(keyStart, keyEnd);
                const key = (keyFlags & CASE_FLAGS) === 0 ? value : value.toLowerCase();
                index++;
                while ((CHAR_MAP[header.charCodeAt(index)] & OWS) !== 0) {
                    index++;
                }
                if (index < len && header.charCodeAt(index) === DQUOTE) {
                    const quotedStart = ++index;
                    let escaped = false;
                    while (index < len) {
                        const code = header.charCodeAt(index);
                        if (code === DQUOTE) {
                            if (parameters[key] === undefined) {
                                parameters[key] = escaped
                                    ? unescapeQuotedPairs(header, quotedStart, index)
                                    : header.slice(quotedStart, index);
                            }
                            index++;
                            let stop = 0;
                            // Discard characters between quote and delimiter.
                            while (index < len) {
                                const code = header.charCodeAt(index);
                                const flags = CHAR_MAP[code];
                                if ((flags & stopFlags) !== 0) {
                                    stop = flags & COMMA_FLAG;
                                    break;
                                }
                                index++;
                            }
                            if (stop !== 0)
                                break parameter;
                            continue parameter;
                        }
                        if (code === BSLASH && index + 1 < len) {
                            escaped = true;
                            index += 2;
                            continue;
                        }
                        index++;
                    }
                    continue parameter;
                }
                const valueStart = index;
                let stop = 0;
                let valueWhitespace = -1;
                while (index < len) {
                    const code = header.charCodeAt(index);
                    const flags = CHAR_MAP[code];
                    if ((flags & stopFlags) !== 0) {
                        stop = flags & COMMA_FLAG;
                        break;
                    }
                    if ((flags & OWS) !== 0) {
                        if (valueWhitespace === -1)
                            valueWhitespace = index;
                    }
                    else {
                        valueWhitespace = -1;
                    }
                    index++;
                }
                if (parameters[key] === undefined) {
                    const valueEnd = valueWhitespace === -1 ? index : valueWhitespace;
                    parameters[key] = header.slice(valueStart, valueEnd);
                }
                if (stop !== 0)
                    break parameter;
                continue parameter;
            }
            if ((flags & OWS) !== 0) {
                if (keyWhitespace === -1)
                    keyWhitespace = index;
            }
            else {
                keyWhitespace = -1;
            }
            keyFlags |= (code & NON_ASCII) | flags;
            index++;
        }
    }
    return { type, index, parameters };
}
/**
 * Remove backslashes from quoted pairs in a known-terminated quoted string body.
 */
function unescapeQuotedPairs(str, start, end) {
    let result = "";
    for (let index = start; index < end; index++) {
        if (str.charCodeAt(index) === BSLASH) {
            result += str.slice(start, index);
            start = ++index;
        }
    }
    return result + str.slice(start, end);
}
//# sourceMappingURL=index.js.map
;// CONCATENATED MODULE: ./node_modules/json-with-bigint/json-with-bigint.js
const intRegex = /^-?\d+$/;
const noiseValue = /^-?\d+n+$/; // Noise - strings that match the custom format before being converted to it
const originalStringify = JSON.stringify;
const originalParse = JSON.parse;
const customFormat = /^-?\d+n$/;

const bigIntsStringify = /([\[:])?"(-?\d+)n"($|\s*[,\}\]])/g;
const noiseStringify = /([\[:])?("-?\d+n+)n("$|"\s*[,\}\]])/g;

/**
 * @typedef {(this: any, key: string | number | undefined, value: any) => any} Replacer
 * @typedef {(key: string | number | undefined, value: any, context?: { source: string }) => any} Reviver
 */

/**
 * Checks if a value is unstringifiable according to native JSON.stringify rules.
 *
 * @param {any} val The value to check.
 * @returns {boolean} True if the value is undefined, a function, or a symbol.
 */
const isUnstringifiable = (val) =>
  val === undefined || typeof val === "function" || typeof val === "symbol";

/**
 * Checks if a value is a native JSON.rawJSON object (Node.js 22+).
 *
 * @param {any} val The value to check.
 * @returns {boolean} True if the value is a RawJSON instance.
 */
const isRawJSON = (val) =>
  val !== null &&
  typeof val === "object" &&
  val.constructor &&
  val.constructor.name === "RawJSON";

/**
 * Iteratively converts a JS value to a JSON string.
 * Used as a fallback when the native JSON.stringify hits the Maximum Call Stack size.
 * Fully compliant with JSON formatting (space), replacers, and toJSON behaviors.
 *
 * @param {any} rootValue The value to stringify.
 * @param {Replacer | Array<string | number> | null} [replacer] User's custom replacer function.
 * @param {string | number} [spaceParam] Indentation for pretty-printing.
 * @returns {string | undefined} The generated JSON string.
 */
const stringifyIteratively = (rootValue, replacer, spaceParam) => {
  let space = "";

  if (typeof spaceParam === "number") {
    space = " ".repeat(Math.min(10, Math.max(0, Math.floor(spaceParam))));
  } else if (typeof spaceParam === "string") {
    space = spaceParam.slice(0, 10);
  }

  const isFunctionReplacer = typeof replacer === "function";
  const propertyList = Array.isArray(replacer)
    ? new Set(replacer.map(String))
    : null;

  /**
   * Prepares a value for stringification by resolving toJSON, handling BigInts,
   * applying custom replacers, and unwrapping primitive objects.
   *
   * @param {object|Array} parent The parent object or array holding the value.
   * @param {string} key The key associated with the value.
   * @param {any} val The raw value to process.
   * @returns {any} The processed value ready for stringification.
   */
  const prepareVal = (parent, key, val) => {
    const isObject = val !== null && typeof val === "object";
    const hasToJSON = isObject && typeof val.toJSON === "function";

    if (hasToJSON) {
      val = val.toJSON(key);
    }

    const isNoise = typeof val === "string" && noiseValue.test(val);

    if (isNoise) return val + "n";

    const isBigInt = typeof val === "bigint";

    if (isBigInt) {
      const supportsRawJSON = "rawJSON" in JSON;

      if (supportsRawJSON) return JSON.rawJSON(val.toString());

      return val.toString() + "n";
    }

    if (isFunctionReplacer) {
      val = replacer.call(parent, key, val);
    }

    const isPostReplacerObject = val !== null && typeof val === "object";

    if (isPostReplacerObject) {
      const isPrimitiveWrapper =
        val instanceof Number ||
        val instanceof String ||
        val instanceof Boolean;

      if (isPrimitiveWrapper) {
        val = val.valueOf();
      }
    }

    return val;
  };

  const rootProcessed = prepareVal({ "": rootValue }, "", rootValue);

  if (isUnstringifiable(rootProcessed)) {
    return undefined;
  }

  const isRootPrimitive =
    rootProcessed === null || typeof rootProcessed !== "object";
  const isRootNativeRawJSON = isRawJSON(rootProcessed);

  if (isRootPrimitive || isRootNativeRawJSON) {
    return originalStringify(rootProcessed);
  }

  const chunks = [];
  let level = 0;

  const stack = [
    {
      parent: { "": rootProcessed },
      key: "",
      val: rootProcessed,
      isArray: Array.isArray(rootProcessed),
      keys: Array.isArray(rootProcessed) ? null : Object.keys(rootProcessed),
      index: 0,
      first: true,
    },
  ];

  const visited = new WeakSet([rootProcessed]);

  while (stack.length > 0) {
    const node = stack[stack.length - 1];

    if (node.index === 0) {
      chunks.push(node.isArray ? "[" : "{");
      level++;
    }

    let isDone = false;

    if (node.isArray) {
      if (node.index < node.val.length) {
        if (!node.first) chunks.push(",");

        if (space) chunks.push("\n" + space.repeat(level));

        const childRaw = node.val[node.index];
        const childVal = prepareVal(node.val, String(node.index), childRaw);

        if (isUnstringifiable(childVal)) {
          chunks.push("null");
          node.first = false;
          node.index++;
        } else {
          const isComplexObject =
            childVal !== null && typeof childVal === "object";
          const isNativeRaw = isRawJSON(childVal);

          if (isComplexObject && !isNativeRaw) {
            if (visited.has(childVal)) {
              throw new TypeError("Converting circular structure to JSON");
            }

            visited.add(childVal);

            stack.push({
              parent: node.val,
              key: String(node.index),
              val: childVal,
              isArray: Array.isArray(childVal),
              keys: Array.isArray(childVal) ? null : Object.keys(childVal),
              index: 0,
              first: true,
            });

            node.first = false;
            node.index++;
          } else {
            chunks.push(originalStringify(childVal));
            node.first = false;
            node.index++;
          }
        }
      } else {
        isDone = true;
      }
    } else {
      while (node.index < node.keys.length) {
        const k = node.keys[node.index++];

        const isFilteredOutByArray = propertyList && !propertyList.has(k);

        if (isFilteredOutByArray) continue;

        const childRaw = node.val[k];
        const childVal = prepareVal(node.val, k, childRaw);

        if (isUnstringifiable(childVal)) continue;

        if (!node.first) chunks.push(",");

        if (space) {
          chunks.push("\n" + space.repeat(level) + originalStringify(k) + ": ");
        } else {
          chunks.push(originalStringify(k) + ":");
        }

        const isComplexObject =
          childVal !== null && typeof childVal === "object";
        const isNativeRaw = isRawJSON(childVal);

        if (isComplexObject && !isNativeRaw) {
          if (visited.has(childVal)) {
            throw new TypeError("Converting circular structure to JSON");
          }

          visited.add(childVal);

          stack.push({
            parent: node.val,
            key: k,
            val: childVal,
            isArray: Array.isArray(childVal),
            keys: Array.isArray(childVal) ? null : Object.keys(childVal),
            index: 0,
            first: true,
          });

          node.first = false;

          break; // Stop current loop level to process the newly pushed stack node
        } else {
          chunks.push(originalStringify(childVal));
          node.first = false;
        }
      }

      const isNodeFullyProcessed =
        node.index >= node.keys.length && stack[stack.length - 1] === node;

      if (isNodeFullyProcessed) {
        isDone = true;
      }
    }

    if (isDone) {
      level--;

      if (!node.first && space) chunks.push("\n" + space.repeat(level));

      chunks.push(node.isArray ? "]" : "}");
      visited.delete(node.val);
      stack.pop();
    }
  }

  return chunks.join("");
};

/**
 * Converts a JavaScript value to a JSON string.
 *
 * Supports serialization of BigInt values using two strategies:
 * 1. Custom format "123n" → "123" (universal fallback)
 * 2. Native JSON.rawJSON() (Node.js 22+, fastest) when available
 *
 * All other values are serialized exactly like native JSON.stringify().
 *
 * @param {*} value The value to convert to a JSON string.
 * @param {Replacer | Array<string | number> | null} [replacer]
 * A function that alters the behavior of the stringification process,
 * or an array of strings/numbers to indicate properties to exclude.
 * @param {string | number} [space]
 * A string or number to specify indentation or pretty-printing.
 * @returns {string} The JSON string representation.
 */
const JSONStringify = (value, replacer, space) => {
  try {
    const supportsRawJSON = "rawJSON" in JSON;

    if (supportsRawJSON) {
      return originalStringify(
        value,
        (key, val) => {
          if (typeof val === "bigint") return JSON.rawJSON(val.toString());

          const hasFunctionReplacer = typeof replacer === "function";

          if (hasFunctionReplacer) return replacer(key, val);

          const isKeyInArrayReplacer =
            Array.isArray(replacer) && replacer.includes(key);

          if (isKeyInArrayReplacer) return val;

          return val;
        },
        space,
      );
    }

    if (!value) return originalStringify(value, replacer, space);

    const convertedToCustomJSON = originalStringify(
      value,
      (key, val) => {
        const isNoise = typeof val === "string" && noiseValue.test(val);

        if (isNoise) return val.toString() + "n"; // Mark noise values with additional "n" to offset the deletion of one "n" during the processing

        if (typeof val === "bigint") return val.toString() + "n";

        const hasFunctionReplacer = typeof replacer === "function";

        if (hasFunctionReplacer) return replacer(key, val);

        const isKeyInArrayReplacer =
          Array.isArray(replacer) && replacer.includes(key);

        if (isKeyInArrayReplacer) return val;

        return val;
      },
      space,
    );

    const processedJSON = convertedToCustomJSON.replace(
      bigIntsStringify,
      "$1$2$3",
    ); // Delete one "n" off the end of every BigInt value

    const denoisedJSON = processedJSON.replace(noiseStringify, "$1$2$3"); // Remove one "n" off the end of every noisy string

    return denoisedJSON;
  } catch (error) {
    if (error instanceof RangeError) {
      const convertedJSON = stringifyIteratively(value, replacer, space);

      if (convertedJSON === undefined) return undefined;

      const supportsRawJSON = "rawJSON" in JSON;

      if (supportsRawJSON) return convertedJSON;

      const processedJSON = convertedJSON.replace(bigIntsStringify, "$1$2$3");

      return processedJSON.replace(noiseStringify, "$1$2$3");
    }

    throw error;
  }
};

const featureCache = new Map();

/**
 * Detects if the current JSON.parse implementation supports the context.source feature.
 *
 * Uses toString() fingerprinting to cache results and automatically detect runtime
 * replacements of JSON.parse (polyfills, mocks, etc.).
 *
 * @returns {boolean} true if context.source is supported, false otherwise.
 */
const isContextSourceSupported = () => {
  const parseFingerprint = JSON.parse.toString();

  if (featureCache.has(parseFingerprint)) {
    return featureCache.get(parseFingerprint);
  }

  try {
    const result = JSON.parse(
      "1",
      (_, __, context) => !!context?.source && context.source === "1",
    );
    featureCache.set(parseFingerprint, result);

    return result;
  } catch {
    featureCache.set(parseFingerprint, false);

    return false;
  }
};

/**
 * Reviver function that converts custom-format BigInt strings back to BigInt values.
 * Also handles "noise" strings that accidentally match the BigInt format.
 *
 * @param {string | number | undefined} key The object key.
 * @param {*} value The value being parsed.
 * @param {object} [context] Parse context (if supported by JSON.parse).
 * @param {Reviver} [userReviver] User's custom reviver function.
 * @returns {any} The transformed value.
 */
const convertMarkedBigIntsReviver = (key, value, context, userReviver) => {
  const isCustomFormatBigInt =
    typeof value === "string" && customFormat.test(value);

  if (isCustomFormatBigInt) return BigInt(value.slice(0, -1));

  const isNoiseValue = typeof value === "string" && noiseValue.test(value);
  if (isNoiseValue) return value.slice(0, -1);

  const hasUserReviver = typeof userReviver === "function";

  if (!hasUserReviver) return value;

  return userReviver(key, value, context);
};

/**
 * Fast JSON.parse implementation (~2x faster than classic fallback).
 * Uses JSON.parse's context.source feature to detect integers and convert
 * large numbers directly to BigInt without string manipulation.
 *
 * Does not support legacy custom format from v1 of this library.
 *
 * @param {string} text JSON string to parse.
 * @param {Reviver} [reviver] Transform function to apply to each value.
 * @returns {any} Parsed JavaScript value.
 */
const JSONParseV2 = (text, reviver) => {
  return JSON.parse(text, (key, value, context) => {
    const isNumber = typeof value === "number";
    const isOutOfBounds =
      value > Number.MAX_SAFE_INTEGER || value < Number.MIN_SAFE_INTEGER;
    const isBigNumber = isNumber && isOutOfBounds;
    const isInt = context && intRegex.test(context.source);
    const isBigInt = isBigNumber && isInt;

    if (isBigInt) return BigInt(context.source);

    const hasCustomReviver = typeof reviver === "function";

    if (!hasCustomReviver) return value;

    return reviver(key, value, context);
  });
};

const MAX_INT = Number.MAX_SAFE_INTEGER.toString();
const MAX_DIGITS = MAX_INT.length;
const stringsOrLargeNumbers =
  /"(?:[^"\\]|\\.)*"|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/g;
const noiseValueWithQuotes = /^"-?\d+n+"$/; // Noise - strings that match the custom format before being converted to it

/**
 * Iteratively traverses the parsed object bottom-up (post-order),
 * emulating the native JSON.parse reviver behavior.
 * This avoids Call Stack overflows (RangeError) on deeply nested structures.
 *
 * @param {any} parsed The natively parsed JSON object.
 * @param {Reviver} [userReviver] User's custom reviver function.
 * @returns {any} The fully processed object.
 */
const applyReviverIteratively = (parsed, userReviver) => {
  const rootHolder = { "": parsed };
  const stack = [{ parent: rootHolder, key: "", visited: false }];

  while (stack.length > 0) {
    const node = stack[stack.length - 1];

    if (!node.visited) {
      node.visited = true;

      const value = node.parent[node.key];
      const isComplexObject = value !== null && typeof value === "object";

      if (isComplexObject) {
        const keys = Object.keys(value);

        for (let i = keys.length - 1; i >= 0; i--) {
          stack.push({ parent: value, key: keys[i], visited: false });
        }
      }
    } else {
      const { parent, key } = node;
      let value = parent[key];

      if (typeof value === "string") {
        const isCustomFormatBigInt = customFormat.test(value);

        if (isCustomFormatBigInt) {
          value = BigInt(value.slice(0, -1));
        } else {
          const isNoise = noiseValue.test(value);

          if (isNoise) value = value.slice(0, -1);
        }
      }

      const hasUserReviver = typeof userReviver === "function";

      if (hasUserReviver) {
        value = userReviver.call(parent, key, value);
      }

      const isDeleted = value === undefined;

      if (isDeleted) {
        delete parent[key];
      } else {
        parent[key] = value;
      }

      stack.pop();
    }
  }

  return rootHolder[""];
};

/**
 * Pre-processes the JSON string to mark large numbers with an 'n' suffix.
 *
 * @param {string} text The raw JSON string.
 * @returns {string} The serialized string with marked BigInts.
 */
const serializeBigInts = (text) => {
  return text.replace(
    stringsOrLargeNumbers,
    (match, digits, fractional, exponential) => {
      const isString = match[0] === '"';
      const isNoise = isString && noiseValueWithQuotes.test(match);

      if (isNoise) return match.substring(0, match.length - 1) + 'n"'; // Mark noise values with additional "n" to offset the deletion of one "n" during the processing

      const hasFractionalOrExponential = fractional || exponential;

      // With a fixed number of digits, we can correctly use lexicographical comparison to do a numeric comparison
      const isLessThanMaxSafeInt =
        digits &&
        (digits.length < MAX_DIGITS ||
          (digits.length === MAX_DIGITS && digits <= MAX_INT));

      const isStandardValue =
        isString || hasFractionalOrExponential || isLessThanMaxSafeInt;

      if (isStandardValue) return match;

      return '"' + match + 'n"';
    },
  );
};

/**
 * Converts a JSON string into a JavaScript value.
 *
 * Supports parsing of large integers using two strategies:
 * 1. Classic fallback: Marks large numbers with "123n" format, then converts to BigInt
 * 2. Fast path (JSONParseV2): Uses context.source feature (~2x faster) when available
 *
 * All other JSON values are parsed exactly like native JSON.parse().
 *
 * @param {string} text A valid JSON string.
 * @param {Reviver} [reviver]
 * A function that transforms the results. This function is called for each member
 * of the object. If a member contains nested objects, the nested objects are
 * transformed before the parent object is.
 * @returns {any} The parsed JavaScript value.
 * @throws {SyntaxError} If text is not valid JSON.
 */
const JSONParse = (text, reviver) => {
  if (!text) return originalParse(text, reviver);

  try {
    if (isContextSourceSupported()) return JSONParseV2(text, reviver); // Shortcut to a faster (2x) and simpler version

    // Find and mark big numbers with "n"
    const serializedData = serializeBigInts(text);

    return originalParse(serializedData, (key, value, context) =>
      convertMarkedBigIntsReviver(key, value, context, reviver),
    );
  } catch (error) {
    if (error instanceof RangeError) {
      const serializedData = serializeBigInts(text);
      const parsed = originalParse(serializedData);

      return applyReviverIteratively(parsed, reviver);
    }

    throw error;
  }
};



;// CONCATENATED MODULE: ./node_modules/@octokit/request-error/dist-src/index.js
class RequestError extends Error {
  name;
  /**
   * http status code
   */
  status;
  /**
   * Request options that lead to the error.
   */
  request;
  /**
   * Response object if a response was received
   */
  response;
  constructor(message, statusCode, options) {
    super(message, { cause: options.cause });
    this.name = "HttpError";
    this.status = Number.parseInt(statusCode);
    if (Number.isNaN(this.status)) {
      this.status = 0;
    }
    /* v8 ignore else -- @preserve -- Bug with vitest coverage where it sees an else branch that doesn't exist */
    if ("response" in options) {
      this.response = options.response;
    }
    const requestCopy = Object.assign({}, options.request);
    if (options.request.headers.authorization) {
      requestCopy.headers = Object.assign({}, options.request.headers, {
        authorization: options.request.headers.authorization.replace(
          /(?<! ) .*$/,
          " [REDACTED]"
        )
      });
    }
    requestCopy.url = requestCopy.url.replace(/\bclient_secret=\w+/g, "client_secret=[REDACTED]").replace(/\baccess_token=\w+/g, "access_token=[REDACTED]");
    this.request = requestCopy;
  }
}


;// CONCATENATED MODULE: ./node_modules/@octokit/request/dist-bundle/index.js
// pkg/dist-src/index.js


// pkg/dist-src/defaults.js


// pkg/dist-src/version.js
var dist_bundle_VERSION = "10.0.16";

// pkg/dist-src/defaults.js
var defaults_default = {
  headers: {
    "user-agent": `octokit-request.js/${dist_bundle_VERSION} ${getUserAgent()}`
  }
};

// pkg/dist-src/fetch-wrapper.js



// pkg/dist-src/is-plain-object.js
function dist_bundle_isPlainObject(value) {
  if (typeof value !== "object" || value === null) return false;
  if (Object.prototype.toString.call(value) !== "[object Object]") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const Ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return typeof Ctor === "function" && Ctor instanceof Ctor && Function.prototype.call(Ctor) === Function.prototype.call(value);
}

// pkg/dist-src/fetch-wrapper.js

var noop = () => "";
async function fetchWrapper(requestOptions) {
  const fetch = requestOptions.request?.fetch || globalThis.fetch;
  if (!fetch) {
    throw new Error(
      "fetch is not set. Please pass a fetch implementation as new Octokit({ request: { fetch }}). Learn more at https://github.com/octokit/octokit.js/#fetch-missing"
    );
  }
  const log = requestOptions.request?.log || console;
  const parseSuccessResponseBody = requestOptions.request?.parseSuccessResponseBody !== false;
  const body = dist_bundle_isPlainObject(requestOptions.body) || Array.isArray(requestOptions.body) ? JSONStringify(requestOptions.body) : requestOptions.body;
  const requestHeaders = Object.fromEntries(
    Object.entries(requestOptions.headers).map(([name, value]) => [
      name,
      String(value)
    ])
  );
  let fetchResponse;
  try {
    fetchResponse = await fetch(requestOptions.url, {
      method: requestOptions.method,
      body,
      redirect: requestOptions.request?.redirect,
      headers: requestHeaders,
      signal: requestOptions.request?.signal,
      // duplex must be set if request.body is ReadableStream or Async Iterables.
      // See https://fetch.spec.whatwg.org/#dom-requestinit-duplex.
      ...requestOptions.body && { duplex: "half" }
    });
  } catch (error) {
    let message = "Unknown Error";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        error.status = 500;
        throw error;
      }
      message = error.message;
      if (error.name === "TypeError" && "cause" in error) {
        if (error.cause instanceof Error) {
          message = error.cause.message;
        } else if (typeof error.cause === "string") {
          message = error.cause;
        }
      }
    }
    const requestError = new RequestError(message, 500, {
      request: requestOptions
    });
    requestError.cause = error;
    throw requestError;
  }
  const status = fetchResponse.status;
  const url = fetchResponse.url;
  const responseHeaders = {};
  for (const [key, value] of fetchResponse.headers) {
    responseHeaders[key] = value;
  }
  const octokitResponse = {
    url,
    status,
    headers: responseHeaders,
    data: ""
  };
  if ("deprecation" in responseHeaders) {
    const matches = responseHeaders.link && responseHeaders.link.match(/<([^<>]+)>; rel="deprecation"/);
    const deprecationLink = matches && matches.pop();
    log.warn(
      `[@octokit/request] "${requestOptions.method} ${requestOptions.url}" is deprecated. It is scheduled to be removed on ${responseHeaders.sunset}${deprecationLink ? `. See ${deprecationLink}` : ""}`
    );
  }
  if (status === 204 || status === 205) {
    return octokitResponse;
  }
  if (requestOptions.method === "HEAD") {
    if (status < 400) {
      return octokitResponse;
    }
    throw new RequestError(fetchResponse.statusText, status, {
      response: octokitResponse,
      request: requestOptions
    });
  }
  if (status === 304) {
    octokitResponse.data = await getResponseData(fetchResponse);
    throw new RequestError("Not modified", status, {
      response: octokitResponse,
      request: requestOptions
    });
  }
  if (status >= 400) {
    octokitResponse.data = await getResponseData(fetchResponse);
    throw new RequestError(toErrorMessage(octokitResponse.data), status, {
      response: octokitResponse,
      request: requestOptions
    });
  }
  octokitResponse.data = parseSuccessResponseBody ? await getResponseData(fetchResponse) : fetchResponse.body;
  return octokitResponse;
}
async function getResponseData(response) {
  const contentType = response.headers.get("content-type");
  if (!contentType) {
    return response.text().catch(noop);
  }
  const mimetype = dist_parse(contentType);
  if (isJSONResponse(mimetype)) {
    let text = "";
    try {
      text = await response.text();
      return JSONParse(text);
    } catch (err) {
      return text;
    }
  } else if (mimetype.type.startsWith("text/") || // `application/octet-stream` is the canonical "arbitrary binary" type
  // (RFC 2046) and must never be decoded as text, even when the response
  // carries a (misleading) `charset=utf-8` parameter — see #751.
  mimetype.parameters.charset?.toLowerCase() === "utf-8" && mimetype.type !== "application/octet-stream") {
    return response.text().catch(noop);
  } else {
    return response.arrayBuffer().catch(
      /* v8 ignore next -- @preserve */
      () => new ArrayBuffer(0)
    );
  }
}
function isJSONResponse(mimetype) {
  return mimetype.type === "application/json" || mimetype.type === "application/scim+json";
}
function toErrorMessage(data) {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return "Unknown error";
  }
  if (typeof data === "object" && data !== null && "message" in data) {
    const objectData = data;
    const suffix = "documentation_url" in objectData ? ` - ${objectData.documentation_url}` : "";
    return Array.isArray(objectData.errors) ? `${objectData.message}: ${objectData.errors.map((v) => JSON.stringify(v)).join(", ")}${suffix}` : `${objectData.message}${suffix}`;
  }
  return `Unknown error: ${JSON.stringify(data)}`;
}

// pkg/dist-src/with-defaults.js
function dist_bundle_withDefaults(oldEndpoint, newDefaults) {
  const endpoint2 = oldEndpoint.defaults(newDefaults);
  const newApi = function(route, parameters) {
    const endpointOptions = endpoint2.merge(route, parameters);
    if (!endpointOptions.request || !endpointOptions.request.hook) {
      return fetchWrapper(endpoint2.parse(endpointOptions));
    }
    const request2 = (route2, parameters2) => {
      return fetchWrapper(
        endpoint2.parse(endpoint2.merge(route2, parameters2))
      );
    };
    Object.assign(request2, {
      endpoint: endpoint2,
      defaults: dist_bundle_withDefaults.bind(null, endpoint2)
    });
    return endpointOptions.request.hook(request2, endpointOptions);
  };
  return Object.assign(newApi, {
    endpoint: endpoint2,
    defaults: dist_bundle_withDefaults.bind(null, endpoint2)
  });
}

// pkg/dist-src/index.js
var request = dist_bundle_withDefaults(endpoint, defaults_default);

/* v8 ignore next -- @preserve */
/* v8 ignore else -- @preserve */

;// CONCATENATED MODULE: ./node_modules/@octokit/graphql/dist-bundle/index.js
// pkg/dist-src/index.js



// pkg/dist-src/version.js
var graphql_dist_bundle_VERSION = "0.0.0-development";

// pkg/dist-src/with-defaults.js


// pkg/dist-src/graphql.js


// pkg/dist-src/error.js
function _buildMessageForResponseErrors(data) {
  return `Request failed due to following response errors:
` + data.errors.map((e) => ` - ${e.message}`).join("\n");
}
var GraphqlResponseError = class extends Error {
  constructor(request2, headers, response) {
    super(_buildMessageForResponseErrors(response));
    this.request = request2;
    this.headers = headers;
    this.response = response;
    this.errors = response.errors;
    this.data = response.data;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  request;
  headers;
  response;
  name = "GraphqlResponseError";
  errors;
  data;
};

// pkg/dist-src/graphql.js
var NON_VARIABLE_OPTIONS = [
  "method",
  "baseUrl",
  "url",
  "headers",
  "request",
  "query",
  "mediaType",
  "operationName"
];
var FORBIDDEN_VARIABLE_OPTIONS = ["query", "method", "url"];
var GHES_V3_SUFFIX_REGEX = /\/api\/v3\/?$/;
function graphql(request2, query, options) {
  if (options) {
    if (typeof query === "string" && "query" in options) {
      return Promise.reject(
        new Error(`[@octokit/graphql] "query" cannot be used as variable name`)
      );
    }
    for (const key in options) {
      if (!FORBIDDEN_VARIABLE_OPTIONS.includes(key)) continue;
      return Promise.reject(
        new Error(
          `[@octokit/graphql] "${key}" cannot be used as variable name`
        )
      );
    }
  }
  const parsedOptions = typeof query === "string" ? Object.assign({ query }, options) : query;
  const requestOptions = Object.keys(
    parsedOptions
  ).reduce((result, key) => {
    if (NON_VARIABLE_OPTIONS.includes(key)) {
      result[key] = parsedOptions[key];
      return result;
    }
    if (!result.variables) {
      result.variables = {};
    }
    result.variables[key] = parsedOptions[key];
    return result;
  }, {});
  const baseUrl = parsedOptions.baseUrl || request2.endpoint.DEFAULTS.baseUrl;
  if (GHES_V3_SUFFIX_REGEX.test(baseUrl)) {
    requestOptions.url = baseUrl.replace(GHES_V3_SUFFIX_REGEX, "/api/graphql");
  }
  return request2(requestOptions).then((response) => {
    if (response.data.errors) {
      const headers = {};
      for (const key of Object.keys(response.headers)) {
        headers[key] = response.headers[key];
      }
      throw new GraphqlResponseError(
        requestOptions,
        headers,
        response.data
      );
    }
    return response.data.data;
  });
}

// pkg/dist-src/with-defaults.js
function graphql_dist_bundle_withDefaults(request2, newDefaults) {
  const newRequest = request2.defaults(newDefaults);
  const newApi = (query, options) => {
    return graphql(newRequest, query, options);
  };
  return Object.assign(newApi, {
    defaults: graphql_dist_bundle_withDefaults.bind(null, newRequest),
    endpoint: newRequest.endpoint
  });
}

// pkg/dist-src/index.js
var graphql2 = graphql_dist_bundle_withDefaults(request, {
  headers: {
    "user-agent": `octokit-graphql.js/${graphql_dist_bundle_VERSION} ${getUserAgent()}`
  },
  method: "POST",
  url: "/graphql"
});
function withCustomRequest(customRequest) {
  return graphql_dist_bundle_withDefaults(customRequest, {
    method: "POST",
    url: "/graphql"
  });
}

/* v8 ignore if -- @preserve */

;// CONCATENATED MODULE: ./node_modules/@octokit/auth-token/dist-bundle/index.js
// pkg/dist-src/is-jwt.js
var b64url = "(?:[a-zA-Z0-9_-]+)";
var sep = "\\.";
var jwtRE = new RegExp(`^${b64url}${sep}${b64url}${sep}${b64url}$`);
var isJWT = jwtRE.test.bind(jwtRE);

// pkg/dist-src/auth.js
async function auth(token) {
  const isApp = isJWT(token);
  const isInstallation = token.startsWith("v1.") || token.startsWith("ghs_");
  const isUserToServer = token.startsWith("ghu_");
  const tokenType = isApp ? "app" : isInstallation ? "installation" : isUserToServer ? "user-to-server" : "oauth";
  return {
    type: "token",
    token,
    tokenType
  };
}

// pkg/dist-src/with-authorization-prefix.js
function withAuthorizationPrefix(token) {
  if (token.split(/\./).length === 3) {
    return `bearer ${token}`;
  }
  return `token ${token}`;
}

// pkg/dist-src/hook.js
async function hook(token, request, route, parameters) {
  const endpoint = request.endpoint.merge(
    route,
    parameters
  );
  endpoint.headers.authorization = withAuthorizationPrefix(token);
  return request(endpoint);
}

// pkg/dist-src/index.js
var createTokenAuth = function createTokenAuth2(token) {
  if (!token) {
    throw new Error("[@octokit/auth-token] No token passed to createTokenAuth");
  }
  if (typeof token !== "string") {
    throw new Error(
      "[@octokit/auth-token] Token passed to createTokenAuth is not a string"
    );
  }
  token = token.replace(/^(token|bearer) +/i, "");
  return Object.assign(auth.bind(null, token), {
    hook: hook.bind(null, token)
  });
};


;// CONCATENATED MODULE: ./node_modules/@octokit/core/dist-src/version.js
const version_VERSION = "7.0.8";


;// CONCATENATED MODULE: ./node_modules/@octokit/core/dist-src/index.js






const dist_src_noop = () => {
};
const consoleWarn = console.warn.bind(console);
const consoleError = console.error.bind(console);
function createLogger(logger = {}) {
  if (typeof logger.debug !== "function") {
    logger.debug = dist_src_noop;
  }
  if (typeof logger.info !== "function") {
    logger.info = dist_src_noop;
  }
  if (typeof logger.warn !== "function") {
    logger.warn = consoleWarn;
  }
  if (typeof logger.error !== "function") {
    logger.error = consoleError;
  }
  return logger;
}
const userAgentTrail = `octokit-core.js/${version_VERSION} ${getUserAgent()}`;
class Octokit {
  static VERSION = version_VERSION;
  static defaults(defaults) {
    const OctokitWithDefaults = class extends this {
      constructor(...args) {
        const options = args[0] || {};
        if (typeof defaults === "function") {
          super(defaults(options));
          return;
        }
        super(
          Object.assign(
            {},
            defaults,
            options,
            options.userAgent && defaults.userAgent ? {
              userAgent: `${options.userAgent} ${defaults.userAgent}`
            } : null
          )
        );
      }
    };
    return OctokitWithDefaults;
  }
  static plugins = [];
  /**
   * Attach a plugin (or many) to your Octokit instance.
   *
   * @example
   * const API = Octokit.plugin(plugin1, plugin2, plugin3, ...)
   */
  static plugin(...newPlugins) {
    const currentPlugins = this.plugins;
    const NewOctokit = class extends this {
      static plugins = currentPlugins.concat(
        newPlugins.filter((plugin) => !currentPlugins.includes(plugin))
      );
    };
    return NewOctokit;
  }
  constructor(options = {}) {
    const hook = new before_after_hook.Collection();
    const requestDefaults = {
      baseUrl: request.endpoint.DEFAULTS.baseUrl,
      headers: {},
      request: Object.assign({}, options.request, {
        // @ts-ignore internal usage only, no need to type
        hook: hook.bind(null, "request")
      }),
      mediaType: {
        previews: [],
        format: ""
      }
    };
    requestDefaults.headers["user-agent"] = options.userAgent ? `${options.userAgent} ${userAgentTrail}` : userAgentTrail;
    if (options.baseUrl) {
      requestDefaults.baseUrl = options.baseUrl;
    }
    if (options.previews) {
      requestDefaults.mediaType.previews = options.previews;
    }
    if (options.timeZone) {
      requestDefaults.headers["time-zone"] = options.timeZone;
    }
    this.request = request.defaults(requestDefaults);
    this.graphql = withCustomRequest(this.request).defaults(requestDefaults);
    this.log = createLogger(options.log);
    this.hook = hook;
    if (!options.authStrategy) {
      if (!options.auth) {
        this.auth = async () => ({
          type: "unauthenticated"
        });
      } else {
        const auth = createTokenAuth(options.auth);
        hook.wrap("request", auth.hook);
        this.auth = auth;
      }
    } else {
      const { authStrategy, ...otherOptions } = options;
      const auth = authStrategy(
        Object.assign(
          {
            request: this.request,
            log: this.log,
            // we pass the current octokit instance as well as its constructor options
            // to allow for authentication strategies that return a new octokit instance
            // that shares the same internal state as the current one. The original
            // requirement for this was the "event-octokit" authentication strategy
            // of https://github.com/probot/octokit-auth-probot.
            octokit: this,
            octokitOptions: otherOptions
          },
          options.auth
        )
      );
      hook.wrap("request", auth.hook);
      this.auth = auth;
    }
    const classConstructor = this.constructor;
    for (let i = 0; i < classConstructor.plugins.length; ++i) {
      Object.assign(this, classConstructor.plugins[i](this, options));
    }
  }
  // assigned during constructor
  request;
  graphql;
  log;
  hook;
  // TODO: type `octokit.auth` based on passed options.authStrategy
  auth;
}


;// CONCATENATED MODULE: ./node_modules/@octokit/plugin-paginate-rest/dist-bundle/index.js
// pkg/dist-src/version.js
var plugin_paginate_rest_dist_bundle_VERSION = "0.0.0-development";

// pkg/dist-src/normalize-paginated-list-response.js
function normalizePaginatedListResponse(response) {
  if (!response.data) {
    return {
      ...response,
      data: []
    };
  }
  const responseNeedsNormalization = ("total_count" in response.data || "total_commits" in response.data) && !("url" in response.data);
  if (!responseNeedsNormalization) return response;
  const incompleteResults = response.data.incomplete_results;
  const repositorySelection = response.data.repository_selection;
  const totalCount = response.data.total_count;
  const totalCommits = response.data.total_commits;
  delete response.data.incomplete_results;
  delete response.data.repository_selection;
  delete response.data.total_count;
  delete response.data.total_commits;
  const namespaceKey = Object.keys(response.data)[0];
  const data = response.data[namespaceKey];
  response.data = data;
  if (typeof incompleteResults !== "undefined") {
    response.data.incomplete_results = incompleteResults;
  }
  if (typeof repositorySelection !== "undefined") {
    response.data.repository_selection = repositorySelection;
  }
  response.data.total_count = totalCount;
  response.data.total_commits = totalCommits;
  return response;
}

// pkg/dist-src/iterator.js
function iterator(octokit, route, parameters) {
  const options = typeof route === "function" ? route.endpoint(parameters) : octokit.request.endpoint(route, parameters);
  const requestMethod = typeof route === "function" ? route : octokit.request;
  const method = options.method;
  const headers = options.headers;
  let url = options.url;
  return {
    [Symbol.asyncIterator]: () => ({
      async next() {
        if (!url) return { done: true };
        try {
          const response = await requestMethod({ method, url, headers });
          const normalizedResponse = normalizePaginatedListResponse(response);
          url = ((normalizedResponse.headers.link || "").match(
            /<([^<>]+)>;\s*rel="next"/
          ) || [])[1];
          if (!url && "total_commits" in normalizedResponse.data) {
            const parsedUrl = new URL(normalizedResponse.url);
            const params = parsedUrl.searchParams;
            const page = parseInt(params.get("page") || "1", 10);
            const per_page = parseInt(params.get("per_page") || "250", 10);
            if (page * per_page < normalizedResponse.data.total_commits) {
              params.set("page", String(page + 1));
              url = parsedUrl.toString();
            }
          }
          return { value: normalizedResponse };
        } catch (error) {
          if (error.status !== 409) throw error;
          url = "";
          return {
            value: {
              status: 200,
              headers: {},
              data: []
            }
          };
        }
      }
    })
  };
}

// pkg/dist-src/paginate.js
function paginate(octokit, route, parameters, mapFn) {
  if (typeof parameters === "function") {
    mapFn = parameters;
    parameters = void 0;
  }
  return gather(
    octokit,
    [],
    iterator(octokit, route, parameters)[Symbol.asyncIterator](),
    mapFn
  );
}
function gather(octokit, results, iterator2, mapFn) {
  return iterator2.next().then((result) => {
    if (result.done) {
      return results;
    }
    let earlyExit = false;
    function done() {
      earlyExit = true;
    }
    results = results.concat(
      mapFn ? mapFn(result.value, done) : result.value.data
    );
    if (earlyExit) {
      return results;
    }
    return gather(octokit, results, iterator2, mapFn);
  });
}

// pkg/dist-src/compose-paginate.js
var composePaginateRest = Object.assign(paginate, {
  iterator
});

// pkg/dist-src/generated/paginating-endpoints.js
var paginatingEndpoints = (/* unused pure expression or super */ null && ([
  "GET /advisories",
  "GET /app/hook/deliveries",
  "GET /app/installation-requests",
  "GET /app/installations",
  "GET /assignments/{assignment_id}/accepted_assignments",
  "GET /classrooms",
  "GET /classrooms/{classroom_id}/assignments",
  "GET /enterprises/{enterprise}/code-security/configurations",
  "GET /enterprises/{enterprise}/code-security/configurations/{configuration_id}/repositories",
  "GET /enterprises/{enterprise}/dependabot/alerts",
  "GET /enterprises/{enterprise}/teams",
  "GET /enterprises/{enterprise}/teams/{enterprise-team}/memberships",
  "GET /enterprises/{enterprise}/teams/{enterprise-team}/organizations",
  "GET /events",
  "GET /gists",
  "GET /gists/public",
  "GET /gists/starred",
  "GET /gists/{gist_id}/comments",
  "GET /gists/{gist_id}/commits",
  "GET /gists/{gist_id}/forks",
  "GET /installation/repositories",
  "GET /issues",
  "GET /licenses",
  "GET /marketplace_listing/plans",
  "GET /marketplace_listing/plans/{plan_id}/accounts",
  "GET /marketplace_listing/stubbed/plans",
  "GET /marketplace_listing/stubbed/plans/{plan_id}/accounts",
  "GET /networks/{owner}/{repo}/events",
  "GET /notifications",
  "GET /organizations",
  "GET /organizations/{org}/dependabot/repository-access",
  "GET /orgs/{org}/actions/cache/usage-by-repository",
  "GET /orgs/{org}/actions/hosted-runners",
  "GET /orgs/{org}/actions/permissions/repositories",
  "GET /orgs/{org}/actions/permissions/self-hosted-runners/repositories",
  "GET /orgs/{org}/actions/runner-groups",
  "GET /orgs/{org}/actions/runner-groups/{runner_group_id}/hosted-runners",
  "GET /orgs/{org}/actions/runner-groups/{runner_group_id}/repositories",
  "GET /orgs/{org}/actions/runner-groups/{runner_group_id}/runners",
  "GET /orgs/{org}/actions/runners",
  "GET /orgs/{org}/actions/secrets",
  "GET /orgs/{org}/actions/secrets/{secret_name}/repositories",
  "GET /orgs/{org}/actions/variables",
  "GET /orgs/{org}/actions/variables/{name}/repositories",
  "GET /orgs/{org}/attestations/repositories",
  "GET /orgs/{org}/attestations/{subject_digest}",
  "GET /orgs/{org}/blocks",
  "GET /orgs/{org}/campaigns",
  "GET /orgs/{org}/code-scanning/alerts",
  "GET /orgs/{org}/code-security/configurations",
  "GET /orgs/{org}/code-security/configurations/{configuration_id}/repositories",
  "GET /orgs/{org}/codespaces",
  "GET /orgs/{org}/codespaces/secrets",
  "GET /orgs/{org}/codespaces/secrets/{secret_name}/repositories",
  "GET /orgs/{org}/copilot/billing/seats",
  "GET /orgs/{org}/copilot/metrics",
  "GET /orgs/{org}/dependabot/alerts",
  "GET /orgs/{org}/dependabot/secrets",
  "GET /orgs/{org}/dependabot/secrets/{secret_name}/repositories",
  "GET /orgs/{org}/events",
  "GET /orgs/{org}/failed_invitations",
  "GET /orgs/{org}/hooks",
  "GET /orgs/{org}/hooks/{hook_id}/deliveries",
  "GET /orgs/{org}/insights/api/route-stats/{actor_type}/{actor_id}",
  "GET /orgs/{org}/insights/api/subject-stats",
  "GET /orgs/{org}/insights/api/user-stats/{user_id}",
  "GET /orgs/{org}/installations",
  "GET /orgs/{org}/invitations",
  "GET /orgs/{org}/invitations/{invitation_id}/teams",
  "GET /orgs/{org}/issues",
  "GET /orgs/{org}/members",
  "GET /orgs/{org}/members/{username}/codespaces",
  "GET /orgs/{org}/migrations",
  "GET /orgs/{org}/migrations/{migration_id}/repositories",
  "GET /orgs/{org}/organization-roles/{role_id}/teams",
  "GET /orgs/{org}/organization-roles/{role_id}/users",
  "GET /orgs/{org}/outside_collaborators",
  "GET /orgs/{org}/packages",
  "GET /orgs/{org}/packages/{package_type}/{package_name}/versions",
  "GET /orgs/{org}/personal-access-token-requests",
  "GET /orgs/{org}/personal-access-token-requests/{pat_request_id}/repositories",
  "GET /orgs/{org}/personal-access-tokens",
  "GET /orgs/{org}/personal-access-tokens/{pat_id}/repositories",
  "GET /orgs/{org}/private-registries",
  "GET /orgs/{org}/projectsV2",
  "GET /orgs/{org}/projectsV2/{project_number}/fields",
  "GET /orgs/{org}/projectsV2/{project_number}/items",
  "GET /orgs/{org}/properties/values",
  "GET /orgs/{org}/public_members",
  "GET /orgs/{org}/repos",
  "GET /orgs/{org}/rulesets",
  "GET /orgs/{org}/rulesets/rule-suites",
  "GET /orgs/{org}/rulesets/{ruleset_id}/history",
  "GET /orgs/{org}/secret-scanning/alerts",
  "GET /orgs/{org}/security-advisories",
  "GET /orgs/{org}/settings/immutable-releases/repositories",
  "GET /orgs/{org}/settings/network-configurations",
  "GET /orgs/{org}/team/{team_slug}/copilot/metrics",
  "GET /orgs/{org}/teams",
  "GET /orgs/{org}/teams/{team_slug}/discussions",
  "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments",
  "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions",
  "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions",
  "GET /orgs/{org}/teams/{team_slug}/invitations",
  "GET /orgs/{org}/teams/{team_slug}/members",
  "GET /orgs/{org}/teams/{team_slug}/repos",
  "GET /orgs/{org}/teams/{team_slug}/teams",
  "GET /repos/{owner}/{repo}/actions/artifacts",
  "GET /repos/{owner}/{repo}/actions/caches",
  "GET /repos/{owner}/{repo}/actions/organization-secrets",
  "GET /repos/{owner}/{repo}/actions/organization-variables",
  "GET /repos/{owner}/{repo}/actions/runners",
  "GET /repos/{owner}/{repo}/actions/runs",
  "GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts",
  "GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs",
  "GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs",
  "GET /repos/{owner}/{repo}/actions/secrets",
  "GET /repos/{owner}/{repo}/actions/variables",
  "GET /repos/{owner}/{repo}/actions/workflows",
  "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs",
  "GET /repos/{owner}/{repo}/activity",
  "GET /repos/{owner}/{repo}/assignees",
  "GET /repos/{owner}/{repo}/attestations/{subject_digest}",
  "GET /repos/{owner}/{repo}/branches",
  "GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations",
  "GET /repos/{owner}/{repo}/check-suites/{check_suite_id}/check-runs",
  "GET /repos/{owner}/{repo}/code-scanning/alerts",
  "GET /repos/{owner}/{repo}/code-scanning/alerts/{alert_number}/instances",
  "GET /repos/{owner}/{repo}/code-scanning/analyses",
  "GET /repos/{owner}/{repo}/codespaces",
  "GET /repos/{owner}/{repo}/codespaces/devcontainers",
  "GET /repos/{owner}/{repo}/codespaces/secrets",
  "GET /repos/{owner}/{repo}/collaborators",
  "GET /repos/{owner}/{repo}/comments",
  "GET /repos/{owner}/{repo}/comments/{comment_id}/reactions",
  "GET /repos/{owner}/{repo}/commits",
  "GET /repos/{owner}/{repo}/commits/{commit_sha}/comments",
  "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls",
  "GET /repos/{owner}/{repo}/commits/{ref}/check-runs",
  "GET /repos/{owner}/{repo}/commits/{ref}/check-suites",
  "GET /repos/{owner}/{repo}/commits/{ref}/status",
  "GET /repos/{owner}/{repo}/commits/{ref}/statuses",
  "GET /repos/{owner}/{repo}/compare/{basehead}",
  "GET /repos/{owner}/{repo}/compare/{base}...{head}",
  "GET /repos/{owner}/{repo}/contributors",
  "GET /repos/{owner}/{repo}/dependabot/alerts",
  "GET /repos/{owner}/{repo}/dependabot/secrets",
  "GET /repos/{owner}/{repo}/deployments",
  "GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses",
  "GET /repos/{owner}/{repo}/environments",
  "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies",
  "GET /repos/{owner}/{repo}/environments/{environment_name}/deployment_protection_rules/apps",
  "GET /repos/{owner}/{repo}/environments/{environment_name}/secrets",
  "GET /repos/{owner}/{repo}/environments/{environment_name}/variables",
  "GET /repos/{owner}/{repo}/events",
  "GET /repos/{owner}/{repo}/forks",
  "GET /repos/{owner}/{repo}/hooks",
  "GET /repos/{owner}/{repo}/hooks/{hook_id}/deliveries",
  "GET /repos/{owner}/{repo}/invitations",
  "GET /repos/{owner}/{repo}/issues",
  "GET /repos/{owner}/{repo}/issues/comments",
  "GET /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions",
  "GET /repos/{owner}/{repo}/issues/events",
  "GET /repos/{owner}/{repo}/issues/{issue_number}/comments",
  "GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by",
  "GET /repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocking",
  "GET /repos/{owner}/{repo}/issues/{issue_number}/events",
  "GET /repos/{owner}/{repo}/issues/{issue_number}/labels",
  "GET /repos/{owner}/{repo}/issues/{issue_number}/reactions",
  "GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues",
  "GET /repos/{owner}/{repo}/issues/{issue_number}/timeline",
  "GET /repos/{owner}/{repo}/keys",
  "GET /repos/{owner}/{repo}/labels",
  "GET /repos/{owner}/{repo}/milestones",
  "GET /repos/{owner}/{repo}/milestones/{milestone_number}/labels",
  "GET /repos/{owner}/{repo}/notifications",
  "GET /repos/{owner}/{repo}/pages/builds",
  "GET /repos/{owner}/{repo}/pulls",
  "GET /repos/{owner}/{repo}/pulls/comments",
  "GET /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions",
  "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
  "GET /repos/{owner}/{repo}/pulls/{pull_number}/commits",
  "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
  "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
  "GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews/{review_id}/comments",
  "GET /repos/{owner}/{repo}/releases",
  "GET /repos/{owner}/{repo}/releases/{release_id}/assets",
  "GET /repos/{owner}/{repo}/releases/{release_id}/reactions",
  "GET /repos/{owner}/{repo}/rules/branches/{branch}",
  "GET /repos/{owner}/{repo}/rulesets",
  "GET /repos/{owner}/{repo}/rulesets/rule-suites",
  "GET /repos/{owner}/{repo}/rulesets/{ruleset_id}/history",
  "GET /repos/{owner}/{repo}/secret-scanning/alerts",
  "GET /repos/{owner}/{repo}/secret-scanning/alerts/{alert_number}/locations",
  "GET /repos/{owner}/{repo}/security-advisories",
  "GET /repos/{owner}/{repo}/stargazers",
  "GET /repos/{owner}/{repo}/subscribers",
  "GET /repos/{owner}/{repo}/tags",
  "GET /repos/{owner}/{repo}/teams",
  "GET /repos/{owner}/{repo}/topics",
  "GET /repositories",
  "GET /search/code",
  "GET /search/commits",
  "GET /search/issues",
  "GET /search/labels",
  "GET /search/repositories",
  "GET /search/topics",
  "GET /search/users",
  "GET /teams/{team_id}/discussions",
  "GET /teams/{team_id}/discussions/{discussion_number}/comments",
  "GET /teams/{team_id}/discussions/{discussion_number}/comments/{comment_number}/reactions",
  "GET /teams/{team_id}/discussions/{discussion_number}/reactions",
  "GET /teams/{team_id}/invitations",
  "GET /teams/{team_id}/members",
  "GET /teams/{team_id}/repos",
  "GET /teams/{team_id}/teams",
  "GET /user/blocks",
  "GET /user/codespaces",
  "GET /user/codespaces/secrets",
  "GET /user/emails",
  "GET /user/followers",
  "GET /user/following",
  "GET /user/gpg_keys",
  "GET /user/installations",
  "GET /user/installations/{installation_id}/repositories",
  "GET /user/issues",
  "GET /user/keys",
  "GET /user/marketplace_purchases",
  "GET /user/marketplace_purchases/stubbed",
  "GET /user/memberships/orgs",
  "GET /user/migrations",
  "GET /user/migrations/{migration_id}/repositories",
  "GET /user/orgs",
  "GET /user/packages",
  "GET /user/packages/{package_type}/{package_name}/versions",
  "GET /user/public_emails",
  "GET /user/repos",
  "GET /user/repository_invitations",
  "GET /user/social_accounts",
  "GET /user/ssh_signing_keys",
  "GET /user/starred",
  "GET /user/subscriptions",
  "GET /user/teams",
  "GET /users",
  "GET /users/{username}/attestations/{subject_digest}",
  "GET /users/{username}/events",
  "GET /users/{username}/events/orgs/{org}",
  "GET /users/{username}/events/public",
  "GET /users/{username}/followers",
  "GET /users/{username}/following",
  "GET /users/{username}/gists",
  "GET /users/{username}/gpg_keys",
  "GET /users/{username}/keys",
  "GET /users/{username}/orgs",
  "GET /users/{username}/packages",
  "GET /users/{username}/projectsV2",
  "GET /users/{username}/projectsV2/{project_number}/fields",
  "GET /users/{username}/projectsV2/{project_number}/items",
  "GET /users/{username}/received_events",
  "GET /users/{username}/received_events/public",
  "GET /users/{username}/repos",
  "GET /users/{username}/social_accounts",
  "GET /users/{username}/ssh_signing_keys",
  "GET /users/{username}/starred",
  "GET /users/{username}/subscriptions"
]));

// pkg/dist-src/paginating-endpoints.js
function isPaginatingEndpoint(arg) {
  if (typeof arg === "string") {
    return paginatingEndpoints.includes(arg);
  } else {
    return false;
  }
}

// pkg/dist-src/index.js
function paginateRest(octokit) {
  return {
    paginate: Object.assign(paginate.bind(null, octokit), {
      iterator: iterator.bind(null, octokit)
    })
  };
}
paginateRest.VERSION = plugin_paginate_rest_dist_bundle_VERSION;

/* v8 ignore next -- @preserve */

// EXTERNAL MODULE: ./node_modules/bottleneck/light.js
var light = __nccwpck_require__(251);
;// CONCATENATED MODULE: ./node_modules/@octokit/plugin-retry/dist-bundle/index.js
// pkg/dist-src/version.js
var plugin_retry_dist_bundle_VERSION = "0.0.0-development";

// pkg/dist-src/error-request.js
function isRequestError(error) {
  return error.request !== void 0;
}
async function errorRequest(state, octokit, error, options) {
  if (!isRequestError(error) || !error?.request.request) {
    throw error;
  }
  if (error.status >= 400 && !state.doNotRetry.includes(error.status)) {
    const retries = options.request.retries != null ? options.request.retries : state.retries;
    const retryAfter = Math.pow((options.request.retryCount || 0) + 1, 2);
    throw octokit.retry.retryRequest(error, retries, retryAfter);
  }
  throw error;
}

// pkg/dist-src/wrap-request.js


async function wrapRequest(state, octokit, request, options) {
  const limiter = new light();
  limiter.on("failed", function(error, info) {
    const maxRetries = ~~error.request.request?.retries;
    const after = ~~error.request.request?.retryAfter;
    options.request.retryCount = info.retryCount + 1;
    if (maxRetries > info.retryCount) {
      return after * state.retryAfterBaseValue;
    }
  });
  return limiter.schedule(
    requestWithGraphqlErrorHandling.bind(null, state, octokit, request),
    options
  );
}
async function requestWithGraphqlErrorHandling(state, octokit, request, options) {
  const response = await request(options);
  if (response.data && response.data.errors && response.data.errors.length > 0 && /Something went wrong while executing your query/.test(
    response.data.errors[0].message
  )) {
    const error = new RequestError(response.data.errors[0].message, 500, {
      request: options,
      response
    });
    return errorRequest(state, octokit, error, options);
  }
  return response;
}

// pkg/dist-src/index.js
function retry(octokit, octokitOptions) {
  const state = Object.assign(
    {
      enabled: true,
      retryAfterBaseValue: 1e3,
      doNotRetry: [400, 401, 403, 404, 410, 422, 451],
      retries: 3
    },
    octokitOptions.retry
  );
  const retryPlugin = {
    retry: {
      retryRequest: (error, retries, retryAfter) => {
        error.request.request = Object.assign({}, error.request.request, {
          retries,
          retryAfter
        });
        return error;
      }
    }
  };
  if (state.enabled) {
    octokit.hook.error("request", errorRequest.bind(null, state, retryPlugin));
    octokit.hook.wrap("request", wrapRequest.bind(null, state, retryPlugin));
  }
  return retryPlugin;
}
retry.VERSION = plugin_retry_dist_bundle_VERSION;


;// CONCATENATED MODULE: ./node_modules/@octokit/plugin-throttling/dist-bundle/index.js
// pkg/dist-src/index.js


// pkg/dist-src/version.js
var plugin_throttling_dist_bundle_VERSION = "0.0.0-development";

// pkg/dist-src/wrap-request.js
var dist_bundle_noop = () => Promise.resolve();
function dist_bundle_wrapRequest(state, request, options) {
  return state.retryLimiter.schedule(doRequest, state, request, options);
}
async function doRequest(state, request, options) {
  const { pathname } = new URL(options.url, "http://github.test");
  const isAuth = isAuthRequest(options.method, pathname);
  const isWrite = !isAuth && options.method !== "GET" && options.method !== "HEAD";
  const isSearch = options.method === "GET" && pathname.startsWith("/search/");
  const isGraphQL = pathname.startsWith("/graphql");
  const retryCount = ~~request.retryCount;
  const jobOptions = retryCount > 0 ? { priority: 0, weight: 0 } : {};
  if (state.clustering) {
    jobOptions.expiration = 1e3 * 60;
  }
  if (isWrite || isGraphQL) {
    await state.write.key(state.id).schedule(jobOptions, dist_bundle_noop);
  }
  if (isWrite && state.triggersNotification(pathname)) {
    await state.notifications.key(state.id).schedule(jobOptions, dist_bundle_noop);
  }
  if (isSearch) {
    await state.search.key(state.id).schedule(jobOptions, dist_bundle_noop);
  }
  const req = (isAuth ? state.auth : state.global).key(state.id).schedule(jobOptions, request, options);
  if (isGraphQL) {
    const res = await req;
    if (res.data.errors != null && res.data.errors.some((error) => error.type === "RATE_LIMITED")) {
      const error = Object.assign(new Error("GraphQL Rate Limit Exceeded"), {
        response: res,
        data: res.data
      });
      throw error;
    }
  }
  return req;
}
function isAuthRequest(method, pathname) {
  return method === "PATCH" && // https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#create-a-scoped-access-token
  /^\/applications\/[^/]+\/token\/scoped$/.test(pathname) || method === "POST" && // https://docs.github.com/en/rest/apps/oauth-applications?apiVersion=2022-11-28#reset-a-token
  (/^\/applications\/[^/]+\/token$/.test(pathname) || // https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#create-an-installation-access-token-for-an-app
  /^\/app\/installations\/[^/]+\/access_tokens$/.test(pathname) || // https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
  pathname === "/login/oauth/access_token");
}

// pkg/dist-src/generated/triggers-notification-paths.js
var triggers_notification_paths_default = [
  "/orgs/{org}/invitations",
  "/orgs/{org}/invitations/{invitation_id}",
  "/orgs/{org}/teams/{team_slug}/discussions",
  "/orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments",
  "/repos/{owner}/{repo}/collaborators/{username}",
  "/repos/{owner}/{repo}/commits/{commit_sha}/comments",
  "/repos/{owner}/{repo}/issues",
  "/repos/{owner}/{repo}/issues/{issue_number}/comments",
  "/repos/{owner}/{repo}/issues/{issue_number}/sub_issue",
  "/repos/{owner}/{repo}/issues/{issue_number}/sub_issues/priority",
  "/repos/{owner}/{repo}/pulls",
  "/repos/{owner}/{repo}/pulls/{pull_number}/comments",
  "/repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies",
  "/repos/{owner}/{repo}/pulls/{pull_number}/merge",
  "/repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers",
  "/repos/{owner}/{repo}/pulls/{pull_number}/reviews",
  "/repos/{owner}/{repo}/releases",
  "/teams/{team_id}/discussions",
  "/teams/{team_id}/discussions/{discussion_number}/comments"
];

// pkg/dist-src/route-matcher.js
function routeMatcher(paths) {
  const regexes = paths.map(
    (path) => path.split("/").map((c) => c.startsWith("{") ? "(?:.+?)" : c).join("/")
  );
  const regex2 = `^(?:${regexes.map((r) => `(?:${r})`).join("|")})[^/]*$`;
  return new RegExp(regex2, "i");
}

// pkg/dist-src/index.js
var regex = routeMatcher(triggers_notification_paths_default);
var triggersNotification = regex.test.bind(regex);
var groups = {};
var createGroups = function(Bottleneck, common) {
  groups.global = new Bottleneck.Group({
    id: "octokit-global",
    maxConcurrent: 10,
    ...common
  });
  groups.auth = new Bottleneck.Group({
    id: "octokit-auth",
    maxConcurrent: 1,
    ...common
  });
  groups.search = new Bottleneck.Group({
    id: "octokit-search",
    maxConcurrent: 1,
    minTime: 2e3,
    ...common
  });
  groups.write = new Bottleneck.Group({
    id: "octokit-write",
    maxConcurrent: 1,
    minTime: 1e3,
    ...common
  });
  groups.notifications = new Bottleneck.Group({
    id: "octokit-notifications",
    maxConcurrent: 1,
    minTime: 3e3,
    ...common
  });
};
function throttling(octokit, octokitOptions) {
  const {
    enabled = true,
    Bottleneck = light,
    id = "no-id",
    timeout = 1e3 * 60 * 2,
    // Redis TTL: 2 minutes
    connection
  } = octokitOptions.throttle || {};
  if (!enabled) {
    return {};
  }
  const common = { timeout };
  if (typeof connection !== "undefined") {
    common.connection = connection;
  }
  const state = Object.assign(
    {
      clustering: connection != null,
      triggersNotification,
      fallbackSecondaryRateRetryAfter: 60,
      retryAfterBaseValue: 1e3,
      id
    },
    octokitOptions.throttle
  );
  if (typeof state.onSecondaryRateLimit !== "function" || typeof state.onRateLimit !== "function") {
    throw new Error(`octokit/plugin-throttling error:
        You must pass the onSecondaryRateLimit and onRateLimit error handlers.
        See https://octokit.github.io/rest.js/#throttling

        const octokit = new Octokit({
          throttle: {
            onSecondaryRateLimit: (retryAfter, options) => {/* ... */},
            onRateLimit: (retryAfter, options) => {/* ... */}
          }
        })
    `);
  }
  let initialized = false;
  const initializeBottleneck = () => {
    if (initialized) {
      return;
    }
    initialized = true;
    if (groups.global == null) {
      createGroups(Bottleneck, common);
    }
    state.global = state.global ?? groups.global;
    state.auth = state.auth ?? groups.auth;
    state.search = state.search ?? groups.search;
    state.write = state.write ?? groups.write;
    state.notifications = state.notifications ?? groups.notifications;
    state.retryLimiter = state.retryLimiter ?? new Bottleneck();
    const events = {};
    const emitter = new Bottleneck.Events(events);
    events.on("secondary-limit", state.onSecondaryRateLimit);
    events.on("rate-limit", state.onRateLimit);
    events.on(
      "error",
      (e) => octokit.log.warn("Error in throttling-plugin limit handler", e)
    );
    state.retryLimiter.on("failed", async function(error, info) {
      const [state2, request, options] = info.args;
      const { pathname } = new URL(options.url, "http://github.test");
      const shouldRetryGraphQL = pathname.startsWith("/graphql") && error.status !== 401;
      if (!(shouldRetryGraphQL || error.status === 403 || error.status === 429)) {
        return;
      }
      const retryCount = ~~request.retryCount;
      request.retryCount = retryCount;
      options.request.retryCount = retryCount;
      const { wantRetry, retryAfter = 0 } = await (async function() {
        if (/\bsecondary rate\b/i.test(error.message)) {
          const retryAfter2 = Number(error.response.headers["retry-after"]) || state2.fallbackSecondaryRateRetryAfter;
          const wantRetry2 = await emitter.trigger(
            "secondary-limit",
            retryAfter2,
            options,
            octokit,
            retryCount
          );
          return { wantRetry: wantRetry2, retryAfter: retryAfter2 };
        }
        if (error.response.headers != null && error.response.headers["x-ratelimit-remaining"] === "0" || (error.response.data?.errors ?? []).some(
          (error2) => error2.type === "RATE_LIMITED"
        )) {
          const rateLimitReset = new Date(
            ~~error.response.headers["x-ratelimit-reset"] * 1e3
          ).getTime();
          const retryAfter2 = Math.max(
            // Add one second so we retry _after_ the reset time
            // https://docs.github.com/en/rest/overview/resources-in-the-rest-api?apiVersion=2022-11-28#exceeding-the-rate-limit
            Math.ceil((rateLimitReset - Date.now()) / 1e3) + 1,
            0
          );
          const wantRetry2 = await emitter.trigger(
            "rate-limit",
            retryAfter2,
            options,
            octokit,
            retryCount
          );
          return { wantRetry: wantRetry2, retryAfter: retryAfter2 };
        }
        return {};
      })();
      if (wantRetry) {
        request.retryCount++;
        return retryAfter * state2.retryAfterBaseValue;
      }
    });
  };
  octokit.hook.wrap("request", (request, options) => {
    initializeBottleneck();
    return dist_bundle_wrapRequest(state, request, options);
  });
  return {};
}
throttling.VERSION = plugin_throttling_dist_bundle_VERSION;
throttling.triggersNotification = triggersNotification;


;// CONCATENATED MODULE: ./registry/packages.ts




/**
 * The Octokit class this module is built for: core + pagination + retry +
 * throttling. This is a primary reason TypeScript replaces the bash here;
 * the bash hand-rolled `Link` header pagination and shipped a raw
 * `curl -X DELETE` with NO backoff, so a single 429 counted as a permanent
 * failure AND consumed a deletion budget slot. Octokit's throttling plugin
 * backs off and retries automatically instead.
 */
const packages_Octokit = Octokit.plugin(paginateRest, retry, throttling);
function createOctokit(auth, options = {}) {
    const maxRetries = options.maxRateLimitRetries ?? 3;
    return new packages_Octokit({
        auth,
        ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
        ...(options.fetch !== undefined ? { request: { fetch: options.fetch } } : {}),
        ...(options.retries !== undefined ? { retry: { retries: options.retries } } : {}),
        throttle: {
            enabled: options.throttle ?? true,
            onRateLimit: (_retryAfter, requestOptions, octokit, retryCount) => {
                octokit.log.warn(`rate limit hit for ${String(requestOptions.method)} ${String(requestOptions.url)}`);
                return retryCount < maxRetries;
            },
            onSecondaryRateLimit: (_retryAfter, requestOptions, octokit, retryCount) => {
                octokit.log.warn(`secondary rate limit hit for ${String(requestOptions.method)} ${String(requestOptions.url)}`);
                return retryCount < maxRetries;
            },
        },
    });
}
/** Maps a raw GitHub Packages API version object to our internal shape. Pure, no I/O. */
function toPackageVersion(raw) {
    return {
        id: raw.id,
        digest: raw.name,
        createdAt: raw.created_at,
        tags: raw.metadata?.container?.tags ?? [],
    };
}
/**
 * Lists every version of a container package, following pagination via
 * Octokit's `paginate` plugin.
 *
 * CAUTION: the GitHub Packages API is a secondary index that goes stale. Do
 * not treat the result of this call as authoritative for read-after-write;
 * e.g. immediately after deleting versions, a subsequent list may still
 * briefly show them, or a subsequent list of a freshly-pushed package may
 * not yet show a new version.
 */
async function listPackageVersions(octokit, org, name) {
    const raws = await octokit.paginate("GET /orgs/{org}/packages/{package_type}/{package_name}/versions", { org, package_type: "container", package_name: name, per_page: 100 });
    return raws.map(toPackageVersion);
}
function isRequestErrorLike(err) {
    return (typeof err === "object" &&
        err !== null &&
        "status" in err &&
        typeof err.status === "number");
}
function classifyDeleteVersionStatus(status) {
    if (status === 204) {
        return "deleted";
    }
    if (status === 404) {
        return "already-gone";
    }
    if (status === 400) {
        return "last-version-conflict";
    }
    throw new Error(`unexpected status ${status} deleting package version`);
}
/**
 * Deletes a single package version.
 *
 * KNOWN GITHUB BEHAVIOUR (observed 2026-09-10 against pyck-ai/baseimages;
 * NOT documented by GitHub; their docs list only 204/401/403/404 for this
 * endpoint and actually claim the opposite): deleting the LAST remaining
 * version of a package via this endpoint returns HTTP 400. Deleting the
 * package itself (see {@link deletePackage}) succeeds with 204 even while
 * versions remain.
 *
 * Consequently this function surfaces a 400 as `"last-version-conflict"`
 * instead of throwing a generic error. Callers must NOT retry the version
 * delete in a loop expecting it to eventually succeed, that loop never
 * terminates. Decide the whole package should go and call
 * {@link deletePackage} once instead.
 */
async function deletePackageVersion(octokit, org, name, versionId) {
    try {
        const res = await octokit.request("DELETE /orgs/{org}/packages/{package_type}/{package_name}/versions/{package_version_id}", {
            org,
            package_type: "container",
            package_name: name,
            package_version_id: versionId,
        });
        return classifyDeleteVersionStatus(res.status);
    }
    catch (err) {
        if (isRequestErrorLike(err)) {
            return classifyDeleteVersionStatus(err.status);
        }
        throw err;
    }
}
function classifyDeletePackageStatus(status) {
    if (status === 204) {
        return "deleted";
    }
    if (status === 404) {
        return "already-gone";
    }
    throw new Error(`unexpected status ${status} deleting package`);
}
/**
 * Deletes an entire package (and all of its versions) in one call. Treats
 * both 204 and 404 as success: a package that is already gone is an
 * acceptable outcome for a retirement workflow, not an error.
 *
 * Do NOT retire a package by deleting its versions one at a time down to
 * zero and then calling this: `deletePackageVersion` cannot remove the last
 * version (see its doc comment), so "zero versions" is unreachable and that
 * loop never terminates. Decide the package should go, then issue this one
 * call.
 */
async function deletePackage(octokit, org, name) {
    try {
        const res = await octokit.request("DELETE /orgs/{org}/packages/{package_type}/{package_name}", {
            org,
            package_type: "container",
            package_name: name,
        });
        return classifyDeletePackageStatus(res.status);
    }
    catch (err) {
        if (isRequestErrorLike(err)) {
            return classifyDeletePackageStatus(err.status);
        }
        throw err;
    }
}

;// CONCATENATED MODULE: ./registry/index.ts








;// CONCATENATED MODULE: ./tidy-core/src/github.ts


const DEFAULT_API_URL = "https://api.github.com";
/** The Octokit client of `registry/` with the base URL taken from the environment. */
function createTidyOctokit(token, options) {
    const baseUrl = (options.env["GITHUB_API_URL"] ?? "") || DEFAULT_API_URL;
    return createOctokit(token, {
        baseUrl,
        fetch: options.fetch,
        ...(options.retries !== undefined
            ? { retries: options.retries, throttle: options.retries !== 0 }
            : {}),
    });
}
/** Reads `GITHUB_REPOSITORY` (`owner/repo`). Throws {@link InputError} for anything else. */
function parseRepository(raw) {
    const [owner, repo, ...rest] = (raw ?? "").split("/");
    if (!owner || !repo || rest.length > 0) {
        throw new InputError(`GITHUB_REPOSITORY must be "owner/repo", got ${JSON.stringify(raw ?? "")}`);
    }
    return { owner, repo };
}
/**
 * A path below a fixed prefix (a branch or cache key): slashes stay literal,
 * every segment is percent-encoded on its own. Encoding the whole path would
 * turn the slashes into `%2F`, which GitHub does not route as a ref path.
 */
function encodePathSegments(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}

;// CONCATENATED MODULE: ./tidy-core/src/index.ts






;// CONCATENATED MODULE: ./branch-tidy/src/github.ts

const REFS_QUERY = `query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", first: 100, after: $cursor) {
      nodes {
        name
        target {
          __typename
          oid
          ... on Commit { committedDate }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
async function getRepo(octokit, repository) {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}", repository);
    const repo = data;
    if (typeof repo.id !== "number" || typeof repo.default_branch !== "string") {
        throw new Error("the repository answer has no id or default_branch");
    }
    return { id: repo.id, defaultBranch: repo.default_branch };
}
async function listOpenPullRequests(octokit, repository) {
    const pulls = await octokit.paginate("GET /repos/{owner}/{repo}/pulls", {
        ...repository,
        state: "open",
        per_page: 100,
    });
    return pulls.map((pull) => {
        const headRepoId = pull.head?.repo?.id;
        return {
            headRef: pull.head?.ref ?? "",
            headRepoId: typeof headRepoId === "number" ? headRepoId : undefined,
            baseRef: pull.base?.ref ?? "",
        };
    });
}
/**
 * Every branch with its protection flag (REST list) joined by name to its
 * head commit date (GraphQL list). Both are paginated list calls, so the
 * number of calls does not grow with the number of branches. Any failure
 * throws: the caller must not delete on a partial picture.
 */
async function listBranches(octokit, repository) {
    const rest = await octokit.paginate("GET /repos/{owner}/{repo}/branches", {
        ...repository,
        per_page: 100,
    });
    const heads = await listHeads(octokit, repository);
    return rest.map((branch) => {
        const head = heads.get(branch.name);
        const restSha = branch.commit?.sha;
        return {
            name: branch.name,
            sha: head?.oid ?? (typeof restSha === "string" ? restSha : ""),
            protected: typeof branch.protected === "boolean" ? branch.protected : undefined,
            committedDate: parseDate(head?.committedDate),
            notACommit: head !== undefined && head.typename !== "Commit",
        };
    });
}
/** A date only for a non-empty string that parses; null, missing or garbage is `undefined`. */
function parseDate(value) {
    if (typeof value !== "string" || value === "")
        return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}
function stringOrUndefined(value) {
    return typeof value === "string" ? value : undefined;
}
async function listHeads(octokit, repository) {
    const heads = new Map();
    let cursor = null;
    for (;;) {
        const data = await octokit.graphql(REFS_QUERY, {
            owner: repository.owner,
            name: repository.repo,
            cursor,
        });
        const refs = data.repository.refs;
        for (const node of refs.nodes) {
            if (node === null)
                continue;
            heads.set(node.name, {
                typename: stringOrUndefined(node.target?.__typename),
                oid: stringOrUndefined(node.target?.oid),
                committedDate: node.target?.committedDate,
            });
        }
        if (!refs.pageInfo.hasNextPage)
            return heads;
        if (refs.pageInfo.endCursor === null) {
            throw new Error("GraphQL reported another page of branches but no cursor");
        }
        cursor = refs.pageInfo.endCursor;
    }
}
/** The SHA the branch points at now, or `undefined` when GitHub answers 404. */
async function getBranchRef(octokit, repository, name) {
    try {
        const { data } = await octokit.request(`GET /repos/{owner}/{repo}/git/ref/heads/${encodePathSegments(name)}`, repository);
        const sha = data.object?.sha;
        if (typeof sha !== "string")
            throw new Error("the ref answer has no object.sha");
        return { sha };
    }
    catch (err) {
        if (statusOf(err) === 404)
            return undefined;
        throw err;
    }
}
async function deleteBranchRef(octokit, repository, name) {
    await octokit.request(`DELETE /repos/{owner}/{repo}/git/refs/heads/${encodePathSegments(name)}`, repository);
}

;// CONCATENATED MODULE: ./branch-tidy/src/inputs.ts


const DEFAULT_KEEP_BRANCHES = "main,master";
/**
 * Reads the inputs from the `INPUT_<NAME>` environment variables the runner
 * sets (upper-cased, `-` kept). Throws {@link InputError} on the first
 * invalid value; nothing is read from the network here.
 */
function parseInputs(env) {
    return {
        token: requiredString(env, "token"),
        retainDays: parseWholeNumber(env, "retain-days", 1),
        dryRun: parseBoolean(env, "dry-run", true),
        excludeOpenPrBranches: parseBoolean(env, "exclude-open-pr-branches", true),
        keepBranches: new Set(optionalString(env, "keep-branches", DEFAULT_KEEP_BRANCHES)
            .split(",")
            .map((name) => name.trim())
            .filter((name) => name !== "")),
    };
}

;// CONCATENATED MODULE: ./branch-tidy/src/judge.ts
/**
 * Decides what to do with every branch. Pure: no I/O, so the whole decision
 * can be tested without a fake API. A head commit exactly at the cutoff is
 * fresh; a branch whose head date cannot be read is never stale.
 */
function judgeBranches(branches, context) {
    const prHeads = new Set();
    const prBases = new Set();
    for (const pr of context.openPullRequests ?? []) {
        if (pr.headRepoId === context.repo.id)
            prHeads.add(pr.headRef);
        prBases.add(pr.baseRef);
    }
    const verdicts = new Map();
    for (const branch of branches) {
        verdicts.set(branch.name, judge(branch, context, prHeads, prBases));
    }
    return verdicts;
}
function judge(branch, context, prHeads, prBases) {
    if (branch.notACommit)
        return { kind: "unreadable", why: "it does not point at a commit" };
    if (branch.committedDate === undefined) {
        return { kind: "unreadable", why: "its head commit date could not be read" };
    }
    if (branch.committedDate.getTime() >= context.cutoff.getTime())
        return { kind: "fresh" };
    if (context.keepBranches.has(branch.name))
        return { kind: "kept", reason: "keep-branches" };
    if (branch.name === context.repo.defaultBranch) {
        return { kind: "kept", reason: "default-branch" };
    }
    if (branch.protected === undefined)
        return { kind: "kept", reason: "protection-unknown" };
    if (branch.protected)
        return { kind: "kept", reason: "protected" };
    if (prHeads.has(branch.name))
        return { kind: "kept", reason: "open-pr-head" };
    if (prBases.has(branch.name))
        return { kind: "kept", reason: "open-pr-base" };
    return { kind: "delete" };
}

;// CONCATENATED MODULE: ./branch-tidy/src/report.ts
const KEEP_LABELS = {
    "keep-branches": "kept by name (keep-branches)",
    "default-branch": "kept, default branch",
    protected: "kept, protected",
    "protection-unknown": "kept, protection status unknown",
    "open-pr-head": "kept, head of an open pull request",
    "open-pr-base": "kept, base of an open pull request",
};
/** A table cell: no pipe or line break may end it early. */
function cell(text) {
    return text.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}
/** The shell command that recreates a deleted branch from the logged head SHA. */
function recreateCommand(branch) {
    return `git push origin ${branch.sha}:refs/heads/${branch.name}`;
}
/** Markdown for `GITHUB_STEP_SUMMARY`. */
function renderSummary(report) {
    const deletedLabel = report.dryRun ? "would delete" : "deleted";
    const lines = [
        "## branch-tidy",
        "",
        `- Mode: ${report.dryRun ? "dry run (nothing is deleted)" : "live"}`,
        `- Cutoff: ${report.cutoff.toISOString()} (a branch is stale when its head commit is older)`,
        "",
        "| Count | Branches |",
        "| --- | ---: |",
        `| Branches seen | ${String(report.seen)} |`,
        `| Stale | ${String(report.stale)} |`,
        `| Kept, head commit date unreadable | ${String(report.unreadable)} |`,
        ...Object.keys(KEEP_LABELS).map((reason) => `| ${KEEP_LABELS[reason]} | ${String(report.kept[reason])} |`),
        `| ${deletedLabel[0]?.toUpperCase() ?? ""}${deletedLabel.slice(1)} | ${String(report.deleted.length)} |`,
        `| Already gone | ${String(report.alreadyGone)} |`,
        `| Changed since listing (kept) | ${String(report.changedSinceListing)} |`,
        `| Failed | ${String(report.failed.length)} |`,
        `| Skipped after an authorization failure | ${String(report.skipped.length)} |`,
        "",
    ];
    if (report.deleted.length > 0) {
        lines.push(`### Branches ${deletedLabel}`, "", "| Branch | Last commit | Head SHA | Recreate with |", "| --- | --- | --- | --- |", ...report.deleted.map((b) => `| ${cell(b.name)} | ${b.committedDate.toISOString()} | ${b.sha} | \`${cell(recreateCommand(b))}\` |`), "");
    }
    if (report.failed.length > 0) {
        lines.push("### Failed", "", ...report.failed.map((name) => `- ${cell(name)}`), "");
    }
    if (report.skipped.length > 0) {
        lines.push("### Skipped", "", ...report.skipped.map((name) => `- ${cell(name)}`), "");
    }
    return lines.join("\n");
}

;// CONCATENATED MODULE: ./branch-tidy/src/main.ts





const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Plain code-unit order, the same on every machine and locale. */
function byName(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
}
/**
 * Runs the action. Returns the exit code (0 on success, 1 on any failure) and
 * never exits the process. Nothing is deleted unless every read it depends on
 * succeeded: a listing failure fails the run before the first deletion.
 */
async function main(opts) {
    const { log: out, notice, warning, error } = createOutput(opts.log);
    const start = opts.now ?? new Date();
    const env = opts.env;
    let inputs;
    let repository;
    try {
        inputs = parseInputs(env);
        repository = parseRepository(env["GITHUB_REPOSITORY"]);
    }
    catch (err) {
        if (!(err instanceof InputError))
            throw err;
        error(err.message);
        return 1;
    }
    const cutoff = new Date(start.getTime() - inputs.retainDays * MS_PER_DAY);
    const octokit = createTidyOctokit(inputs.token, {
        env,
        fetch: opts.fetch,
        ...(opts.retries !== undefined ? { retries: opts.retries } : {}),
    });
    const report = {
        dryRun: inputs.dryRun,
        cutoff,
        seen: 0,
        stale: 0,
        unreadable: 0,
        kept: {
            "keep-branches": 0,
            "default-branch": 0,
            protected: 0,
            "protection-unknown": 0,
            "open-pr-head": 0,
            "open-pr-base": 0,
        },
        deleted: [],
        alreadyGone: 0,
        changedSinceListing: 0,
        failed: [],
        skipped: [],
    };
    let branches;
    let verdicts;
    try {
        const repo = await getRepo(octokit, repository);
        branches = (await listBranches(octokit, repository)).sort((a, b) => byName(a.name, b.name));
        const openPullRequests = inputs.excludeOpenPrBranches
            ? await listOpenPullRequests(octokit, repository)
            : undefined;
        verdicts = judgeBranches(branches, {
            cutoff,
            keepBranches: inputs.keepBranches,
            repo,
            openPullRequests,
        });
    }
    catch (err) {
        error(`Nothing was deleted: reading the repository's branches failed. ${describeError(err)}`);
        return 1;
    }
    report.seen = branches.length;
    const toDelete = [];
    for (const branch of branches) {
        const verdict = verdicts.get(branch.name);
        if (verdict === undefined || verdict.kind === "fresh")
            continue;
        if (verdict.kind === "unreadable") {
            report.unreadable++;
            warning(`Keeping branch ${branch.name}: ${verdict.why}.`);
            continue;
        }
        report.stale++;
        if (verdict.kind === "kept") {
            report.kept[verdict.reason]++;
            out(`Keeping stale branch ${branch.name}: ${keepText(verdict.reason)}.`);
            continue;
        }
        toDelete.push(branch);
    }
    let authFailure = false;
    for (const [index, branch] of toDelete.entries()) {
        const committedDate = branch.committedDate;
        const judged = { name: branch.name, sha: branch.sha, committedDate };
        if (inputs.dryRun) {
            out(`Would delete branch ${branch.name} (head ${branch.sha}, last commit ${committedDate.toISOString()}).`);
            report.deleted.push(judged);
            continue;
        }
        try {
            const current = await getBranchRef(octokit, repository, branch.name);
            if (current === undefined) {
                notice(`Branch ${branch.name} is already gone.`);
                report.alreadyGone++;
                continue;
            }
            if (current.sha !== branch.sha) {
                notice(`Branch ${branch.name} changed since listing (head ${branch.sha} is now ${current.sha}); keeping it.`);
                report.changedSinceListing++;
                continue;
            }
            out(`Deleting branch ${branch.name} (head ${branch.sha}, last commit ${committedDate.toISOString()}).`);
            await deleteBranchRef(octokit, repository, branch.name);
            report.deleted.push(judged);
        }
        catch (err) {
            report.failed.push(branch.name);
            error(`Could not delete branch ${branch.name}: ${describeError(err)}`);
            const status = statusOf(err);
            if (status === 401 || status === 403) {
                authFailure = true;
                report.skipped = toDelete.slice(index + 1).map((b) => b.name);
                break;
            }
        }
    }
    await appendStepSummary(env["GITHUB_STEP_SUMMARY"], renderSummary(report), warning);
    if (authFailure) {
        error(`Stopped after an authorization failure on ${report.failed.join(", ")}. Not attempted: ${report.skipped.length > 0 ? report.skipped.join(", ") : "none"}.`);
        return 1;
    }
    if (report.failed.length > 0) {
        error(`Failed to delete ${String(report.failed.length)} branch(es): ${report.failed.join(", ")}.`);
        return 1;
    }
    return 0;
}
function keepText(reason) {
    switch (reason) {
        case "keep-branches":
            return "it is listed in keep-branches";
        case "default-branch":
            return "it is the default branch";
        case "protected":
            return "it is protected";
        case "protection-unknown":
            return "its protection status could not be read";
        case "open-pr-head":
            return "it is the head of an open pull request";
        case "open-pr-base":
            return "it is the base of an open pull request";
    }
}

;// CONCATENATED MODULE: ./branch-tidy/src/index.ts

// No top-level await: ncc bundles to CommonJS.
main({ env: process.env, fetch: globalThis.fetch }).then((code) => {
    process.exitCode = code;
}, (err) => {
    process.stdout.write(`::error::${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
});

