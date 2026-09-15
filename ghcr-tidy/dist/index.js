#!/usr/bin/env node
import { createRequire as __WEBPACK_EXTERNAL_createRequire } from "module";
/******/ var __webpack_modules__ = ({

/***/ 3251:
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


/***/ }),

/***/ 181:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("buffer");

/***/ }),

/***/ 932:
/***/ ((module) => {

module.exports = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("process");

/***/ }),

/***/ 1120:
/***/ ((module) => {

var __webpack_unused_export__;


const NullObject = function NullObject () { }
NullObject.prototype = Object.create(null)

/**
 * RegExp to match *( ";" parameter ) in RFC 7231 sec 3.1.1.1
 *
 * parameter     = token "=" ( token / quoted-string )
 * token         = 1*tchar
 * tchar         = "!" / "#" / "$" / "%" / "&" / "'" / "*"
 *               / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
 *               / DIGIT / ALPHA
 *               ; any VCHAR, except delimiters
 * quoted-string = DQUOTE *( qdtext / quoted-pair ) DQUOTE
 * qdtext        = HTAB / SP / %x21 / %x23-5B / %x5D-7E / obs-text
 * obs-text      = %x80-FF
 * quoted-pair   = "\" ( HTAB / SP / VCHAR / obs-text )
 */
const paramRE = /; *([!#$%&'*+.^\w`|~-]+)=("(?:[\v\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\v\u0020-\u00ff])*"|[!#$%&'*+.^\w`|~-]+) */gu

/**
 * RegExp to match quoted-pair in RFC 7230 sec 3.2.6
 *
 * quoted-pair = "\" ( HTAB / SP / VCHAR / obs-text )
 * obs-text    = %x80-FF
 */
const quotedPairRE = /\\([\v\u0020-\u00ff])/gu

/**
 * RegExp to match type in RFC 7231 sec 3.1.1.1
 *
 * media-type = type "/" subtype
 * type       = token
 * subtype    = token
 */
const mediaTypeRE = /^[!#$%&'*+.^\w|~-]+\/[!#$%&'*+.^\w|~-]+$/u

// default ContentType to prevent repeated object creation
const defaultContentType = { type: '', parameters: new NullObject() }
Object.freeze(defaultContentType.parameters)
Object.freeze(defaultContentType)

/**
 * Parse media type to object.
 *
 * @param {string|object} header
 * @return {Object}
 * @public
 */

function parse (header) {
  if (typeof header !== 'string') {
    throw new TypeError('argument header is required and must be a string')
  }

  let index = header.indexOf(';')
  const type = index !== -1
    ? header.slice(0, index).trim()
    : header.trim()

  if (mediaTypeRE.test(type) === false) {
    throw new TypeError('invalid media type')
  }

  const result = {
    type: type.toLowerCase(),
    parameters: new NullObject()
  }

  // parse parameters
  if (index === -1) {
    return result
  }

  let key
  let match
  let value

  paramRE.lastIndex = index

  while ((match = paramRE.exec(header))) {
    if (match.index !== index) {
      throw new TypeError('invalid parameter format')
    }

    index += match[0].length
    key = match[1].toLowerCase()
    value = match[2]

    if (value[0] === '"') {
      // remove quotes and escapes
      value = value
        .slice(1, value.length - 1)

      quotedPairRE.test(value) && (value = value.replace(quotedPairRE, '$1'))
    }

    result.parameters[key] = value
  }

  if (index !== header.length) {
    throw new TypeError('invalid parameter format')
  }

  return result
}

function safeParse (header) {
  if (typeof header !== 'string') {
    return defaultContentType
  }

  let index = header.indexOf(';')
  const type = index !== -1
    ? header.slice(0, index).trim()
    : header.trim()

  if (mediaTypeRE.test(type) === false) {
    return defaultContentType
  }

  const result = {
    type: type.toLowerCase(),
    parameters: new NullObject()
  }

  // parse parameters
  if (index === -1) {
    return result
  }

  let key
  let match
  let value

  paramRE.lastIndex = index

  while ((match = paramRE.exec(header))) {
    if (match.index !== index) {
      return defaultContentType
    }

    index += match[0].length
    key = match[1].toLowerCase()
    value = match[2]

    if (value[0] === '"') {
      // remove quotes and escapes
      value = value
        .slice(1, value.length - 1)

      quotedPairRE.test(value) && (value = value.replace(quotedPairRE, '$1'))
    }

    result.parameters[key] = value
  }

  if (index !== header.length) {
    return defaultContentType
  }

  return result
}

__webpack_unused_export__ = { parse, safeParse }
__webpack_unused_export__ = parse
module.exports.xL = safeParse
__webpack_unused_export__ = defaultContentType


/***/ }),

/***/ 7349:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var Scalar = __nccwpck_require__(3301);
var YAMLMap = __nccwpck_require__(4454);
var YAMLSeq = __nccwpck_require__(2223);
var resolveBlockMap = __nccwpck_require__(7103);
var resolveBlockSeq = __nccwpck_require__(334);
var resolveFlowCollection = __nccwpck_require__(3142);

function resolveCollection(CN, ctx, token, onError, tagName, tag) {
    const coll = token.type === 'block-map'
        ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag)
        : token.type === 'block-seq'
            ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag)
            : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
    const Coll = coll.constructor;
    // If we got a tagName matching the class, or the tag name is '!',
    // then use the tagName from the node class used to create it.
    if (tagName === '!' || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
    }
    if (tagName)
        coll.tag = tagName;
    return coll;
}
function composeCollection(CN, ctx, token, props, onError) {
    const tagToken = props.tag;
    const tagName = !tagToken
        ? null
        : ctx.directives.tagName(tagToken.source, msg => onError(tagToken, 'TAG_RESOLVE_FAILED', msg));
    if (token.type === 'block-seq') {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken
            ? anchor.offset > tagToken.offset
                ? anchor
                : tagToken
            : (anchor ?? tagToken);
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
            const message = 'Missing newline after block sequence props';
            onError(lastProp, 'MISSING_CHAR', message);
        }
    }
    const expType = token.type === 'block-map'
        ? 'map'
        : token.type === 'block-seq'
            ? 'seq'
            : token.start.source === '{'
                ? 'map'
                : 'seq';
    // shortcut: check if it's a generic YAMLMap or YAMLSeq
    // before jumping into the custom tag logic.
    if (!tagToken ||
        !tagName ||
        tagName === '!' ||
        (tagName === YAMLMap.YAMLMap.tagName && expType === 'map') ||
        (tagName === YAMLSeq.YAMLSeq.tagName && expType === 'seq')) {
        return resolveCollection(CN, ctx, token, onError, tagName);
    }
    let tag = ctx.schema.tags.find(t => t.tag === tagName && t.collection === expType);
    if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
            ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
            tag = kt;
        }
        else {
            if (kt) {
                onError(tagToken, 'BAD_COLLECTION_TYPE', `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? 'scalar'}`, true);
            }
            else {
                onError(tagToken, 'TAG_RESOLVE_FAILED', `Unresolved tag: ${tagName}`, true);
            }
            return resolveCollection(CN, ctx, token, onError, tagName);
        }
    }
    const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
    const res = tag.resolve?.(coll, msg => onError(tagToken, 'TAG_RESOLVE_FAILED', msg), ctx.options) ?? coll;
    const node = identity.isNode(res)
        ? res
        : new Scalar.Scalar(res);
    node.range = coll.range;
    node.tag = tagName;
    if (tag?.format)
        node.format = tag.format;
    return node;
}

exports.composeCollection = composeCollection;


/***/ }),

/***/ 3683:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Document = __nccwpck_require__(3021);
var composeNode = __nccwpck_require__(5937);
var resolveEnd = __nccwpck_require__(7788);
var resolveProps = __nccwpck_require__(4631);

function composeDoc(options, directives, { offset, start, value, end }, onError) {
    const opts = Object.assign({ _directives: directives }, options);
    const doc = new Document.Document(undefined, opts);
    const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
    };
    const props = resolveProps.resolveProps(start, {
        indicator: 'doc-start',
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
    });
    if (props.found) {
        doc.directives.docStart = true;
        if (value &&
            (value.type === 'block-map' || value.type === 'block-seq') &&
            !props.hasNewline)
            onError(props.end, 'MISSING_CHAR', 'Block collection cannot start on same line with directives-end marker');
    }
    // @ts-expect-error If Contents is set, let's trust the user
    doc.contents = value
        ? composeNode.composeNode(ctx, value, props, onError)
        : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
    const contentEnd = doc.contents.range[2];
    const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
    if (re.comment)
        doc.comment = re.comment;
    doc.range = [offset, contentEnd, re.offset];
    return doc;
}

exports.composeDoc = composeDoc;


/***/ }),

/***/ 5937:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Alias = __nccwpck_require__(4065);
var identity = __nccwpck_require__(1127);
var composeCollection = __nccwpck_require__(7349);
var composeScalar = __nccwpck_require__(5413);
var resolveEnd = __nccwpck_require__(7788);
var utilEmptyScalarPosition = __nccwpck_require__(2599);

const CN = { composeNode, composeEmptyNode };
function composeNode(ctx, token, props, onError) {
    const atKey = ctx.atKey;
    const { spaceBefore, comment, anchor, tag } = props;
    let node;
    let isSrcToken = true;
    switch (token.type) {
        case 'alias':
            node = composeAlias(ctx, token, onError);
            if (anchor || tag)
                onError(token, 'ALIAS_PROPS', 'An alias node must not specify any properties');
            break;
        case 'scalar':
        case 'single-quoted-scalar':
        case 'double-quoted-scalar':
        case 'block-scalar':
            node = composeScalar.composeScalar(ctx, token, tag, onError);
            if (anchor)
                node.anchor = anchor.source.substring(1);
            break;
        case 'block-map':
        case 'block-seq':
        case 'flow-collection':
            try {
                node = composeCollection.composeCollection(CN, ctx, token, props, onError);
                if (anchor)
                    node.anchor = anchor.source.substring(1);
            }
            catch (error) {
                // Almost certainly here due to a stack overflow
                const message = error instanceof Error ? error.message : String(error);
                onError(token, 'RESOURCE_EXHAUSTION', message);
            }
            break;
        default: {
            const message = token.type === 'error'
                ? token.message
                : `Unsupported token (type: ${token.type})`;
            onError(token, 'UNEXPECTED_TOKEN', message);
            isSrcToken = false;
        }
    }
    node ?? (node = composeEmptyNode(ctx, token.offset, undefined, null, props, onError));
    if (anchor && node.anchor === '')
        onError(anchor, 'BAD_ALIAS', 'Anchor cannot be an empty string');
    if (atKey &&
        ctx.options.stringKeys &&
        (!identity.isScalar(node) ||
            typeof node.value !== 'string' ||
            (node.tag && node.tag !== 'tag:yaml.org,2002:str'))) {
        const msg = 'With stringKeys, all keys must be strings';
        onError(tag ?? token, 'NON_STRING_KEY', msg);
    }
    if (spaceBefore)
        node.spaceBefore = true;
    if (comment) {
        if (token.type === 'scalar' && token.source === '')
            node.comment = comment;
        else
            node.commentBefore = comment;
    }
    // @ts-expect-error Type checking misses meaning of isSrcToken
    if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
    return node;
}
function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
    const token = {
        type: 'scalar',
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ''
    };
    const node = composeScalar.composeScalar(ctx, token, tag, onError);
    if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === '')
            onError(anchor, 'BAD_ALIAS', 'Anchor cannot be an empty string');
    }
    if (spaceBefore)
        node.spaceBefore = true;
    if (comment) {
        node.comment = comment;
        node.range[2] = end;
    }
    return node;
}
function composeAlias({ options }, { offset, source, end }, onError) {
    const alias = new Alias.Alias(source.substring(1));
    if (alias.source === '')
        onError(offset, 'BAD_ALIAS', 'Alias cannot be an empty string');
    if (alias.source.endsWith(':'))
        onError(offset + source.length - 1, 'BAD_ALIAS', 'Alias ending in : is ambiguous', true);
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
    alias.range = [offset, valueEnd, re.offset];
    if (re.comment)
        alias.comment = re.comment;
    return alias;
}

exports.composeEmptyNode = composeEmptyNode;
exports.composeNode = composeNode;


/***/ }),

/***/ 5413:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var Scalar = __nccwpck_require__(3301);
var resolveBlockScalar = __nccwpck_require__(8913);
var resolveFlowScalar = __nccwpck_require__(6842);

function composeScalar(ctx, token, tagToken, onError) {
    const { value, type, comment, range } = token.type === 'block-scalar'
        ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError)
        : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
    const tagName = tagToken
        ? ctx.directives.tagName(tagToken.source, msg => onError(tagToken, 'TAG_RESOLVE_FAILED', msg))
        : null;
    let tag;
    if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
    }
    else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
    else if (token.type === 'scalar')
        tag = findScalarTagByTest(ctx, value, token, onError);
    else
        tag = ctx.schema[identity.SCALAR];
    let scalar;
    try {
        const res = tag.resolve(value, msg => onError(tagToken ?? token, 'TAG_RESOLVE_FAILED', msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, 'TAG_RESOLVE_FAILED', msg);
        scalar = new Scalar.Scalar(value);
    }
    scalar.range = range;
    scalar.source = value;
    if (type)
        scalar.type = type;
    if (tagName)
        scalar.tag = tagName;
    if (tag.format)
        scalar.format = tag.format;
    if (comment)
        scalar.comment = comment;
    return scalar;
}
function findScalarTagByName(schema, value, tagName, tagToken, onError) {
    if (tagName === '!')
        return schema[identity.SCALAR]; // non-specific tag
    const matchWithTest = [];
    for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
            if (tag.default && tag.test)
                matchWithTest.push(tag);
            else
                return tag;
        }
    }
    for (const tag of matchWithTest)
        if (tag.test?.test(value))
            return tag;
    const kt = schema.knownTags[tagName];
    if (kt && !kt.collection) {
        // Ensure that the known tag is available for stringifying,
        // but does not get used by default.
        schema.tags.push(Object.assign({}, kt, { default: false, test: undefined }));
        return kt;
    }
    onError(tagToken, 'TAG_RESOLVE_FAILED', `Unresolved tag: ${tagName}`, tagName !== 'tag:yaml.org,2002:str');
    return schema[identity.SCALAR];
}
function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
    const tag = schema.tags.find(tag => (tag.default === true || (atKey && tag.default === 'key')) &&
        tag.test?.test(value)) || schema[identity.SCALAR];
    if (schema.compat) {
        const compat = schema.compat.find(tag => tag.default && tag.test?.test(value)) ??
            schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
            const ts = directives.tagString(tag.tag);
            const cs = directives.tagString(compat.tag);
            const msg = `Value may be parsed as either ${ts} or ${cs}`;
            onError(token, 'TAG_RESOLVE_FAILED', msg, true);
        }
    }
    return tag;
}

exports.composeScalar = composeScalar;


/***/ }),

/***/ 9984:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var node_process = __nccwpck_require__(932);
var directives = __nccwpck_require__(1342);
var Document = __nccwpck_require__(3021);
var errors = __nccwpck_require__(1464);
var identity = __nccwpck_require__(1127);
var composeDoc = __nccwpck_require__(3683);
var resolveEnd = __nccwpck_require__(7788);

function getErrorPos(src) {
    if (typeof src === 'number')
        return [src, src + 1];
    if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
    const { offset, source } = src;
    return [offset, offset + (typeof source === 'string' ? source.length : 1)];
}
function parsePrelude(prelude) {
    let comment = '';
    let atComment = false;
    let afterEmptyLine = false;
    for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
            case '#':
                comment +=
                    (comment === '' ? '' : afterEmptyLine ? '\n\n' : '\n') +
                        (source.substring(1) || ' ');
                atComment = true;
                afterEmptyLine = false;
                break;
            case '%':
                if (prelude[i + 1]?.[0] !== '#')
                    i += 1;
                atComment = false;
                break;
            default:
                // This may be wrong after doc-end, but in that case it doesn't matter
                if (!atComment)
                    afterEmptyLine = true;
                atComment = false;
        }
    }
    return { comment, afterEmptyLine };
}
/**
 * Compose a stream of CST nodes into a stream of YAML Documents.
 *
 * ```ts
 * import { Composer, Parser } from 'yaml'
 *
 * const src: string = ...
 * const tokens = new Parser().parse(src)
 * const docs = new Composer().compose(tokens)
 * ```
 */
class Composer {
    constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
            const pos = getErrorPos(source);
            if (warning)
                this.warnings.push(new errors.YAMLWarning(pos, code, message));
            else
                this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        this.directives = new directives.Directives({ version: options.version || '1.2' });
        this.options = options;
    }
    decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        //console.log({ dc: doc.comment, prelude, comment })
        if (comment) {
            const dc = doc.contents;
            if (afterDoc) {
                doc.comment = doc.comment ? `${doc.comment}\n${comment}` : comment;
            }
            else if (afterEmptyLine || doc.directives.docStart || !dc) {
                doc.commentBefore = comment;
            }
            else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
                let it = dc.items[0];
                if (identity.isPair(it))
                    it = it.key;
                const cb = it.commentBefore;
                it.commentBefore = cb ? `${comment}\n${cb}` : comment;
            }
            else {
                const cb = dc.commentBefore;
                dc.commentBefore = cb ? `${comment}\n${cb}` : comment;
            }
        }
        if (afterDoc) {
            for (let i = 0; i < this.errors.length; ++i)
                doc.errors.push(this.errors[i]);
            for (let i = 0; i < this.warnings.length; ++i)
                doc.warnings.push(this.warnings[i]);
        }
        else {
            doc.errors = this.errors;
            doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
    }
    /**
     * Current stream status information.
     *
     * Mostly useful at the end of input for an empty stream.
     */
    streamInfo() {
        return {
            comment: parsePrelude(this.prelude).comment,
            directives: this.directives,
            errors: this.errors,
            warnings: this.warnings
        };
    }
    /**
     * Compose tokens into documents.
     *
     * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
     * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
     */
    *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
            yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
    }
    /** Advance the composer by one CST token. */
    *next(token) {
        if (node_process.env.LOG_STREAM)
            console.dir(token, { depth: null });
        switch (token.type) {
            case 'directive':
                this.directives.add(token.source, (offset, message, warning) => {
                    const pos = getErrorPos(token);
                    pos[0] += offset;
                    this.onError(pos, 'BAD_DIRECTIVE', message, warning);
                });
                this.prelude.push(token.source);
                this.atDirectives = true;
                break;
            case 'document': {
                const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
                if (this.atDirectives && !doc.directives.docStart)
                    this.onError(token, 'MISSING_CHAR', 'Missing directives-end/doc-start indicator line');
                this.decorate(doc, false);
                if (this.doc)
                    yield this.doc;
                this.doc = doc;
                this.atDirectives = false;
                break;
            }
            case 'byte-order-mark':
            case 'space':
                break;
            case 'comment':
            case 'newline':
                this.prelude.push(token.source);
                break;
            case 'error': {
                const msg = token.source
                    ? `${token.message}: ${JSON.stringify(token.source)}`
                    : token.message;
                const error = new errors.YAMLParseError(getErrorPos(token), 'UNEXPECTED_TOKEN', msg);
                if (this.atDirectives || !this.doc)
                    this.errors.push(error);
                else
                    this.doc.errors.push(error);
                break;
            }
            case 'doc-end': {
                if (!this.doc) {
                    const msg = 'Unexpected doc-end without preceding document';
                    this.errors.push(new errors.YAMLParseError(getErrorPos(token), 'UNEXPECTED_TOKEN', msg));
                    break;
                }
                this.doc.directives.docEnd = true;
                const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
                this.decorate(this.doc, true);
                if (end.comment) {
                    const dc = this.doc.comment;
                    this.doc.comment = dc ? `${dc}\n${end.comment}` : end.comment;
                }
                this.doc.range[2] = end.offset;
                break;
            }
            default:
                this.errors.push(new errors.YAMLParseError(getErrorPos(token), 'UNEXPECTED_TOKEN', `Unsupported token ${token.type}`));
        }
    }
    /**
     * Call at end of input to yield any remaining document.
     *
     * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
     * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
     */
    *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
            this.decorate(this.doc, true);
            yield this.doc;
            this.doc = null;
        }
        else if (forceDoc) {
            const opts = Object.assign({ _directives: this.directives }, this.options);
            const doc = new Document.Document(undefined, opts);
            if (this.atDirectives)
                this.onError(endOffset, 'MISSING_CHAR', 'Missing directives-end indicator line');
            doc.range = [0, endOffset, endOffset];
            this.decorate(doc, false);
            yield doc;
        }
    }
}

exports.Composer = Composer;


/***/ }),

/***/ 7103:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Pair = __nccwpck_require__(7165);
var YAMLMap = __nccwpck_require__(4454);
var resolveProps = __nccwpck_require__(4631);
var utilContainsNewline = __nccwpck_require__(9499);
var utilFlowIndentCheck = __nccwpck_require__(4051);
var utilMapIncludes = __nccwpck_require__(1187);

const startColMsg = 'All mapping items must start at the same column';
function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
    const map = new NodeClass(ctx.schema);
    if (ctx.atRoot)
        ctx.atRoot = false;
    let offset = bm.offset;
    let commentEnd = null;
    for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        // key properties
        const keyProps = resolveProps.resolveProps(start, {
            indicator: 'explicit-key-ind',
            next: key ?? sep?.[0],
            offset,
            onError,
            parentIndent: bm.indent,
            startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
            if (key) {
                if (key.type === 'block-seq')
                    onError(offset, 'BLOCK_AS_IMPLICIT_KEY', 'A block sequence may not be used as an implicit map key');
                else if ('indent' in key && key.indent !== bm.indent)
                    onError(offset, 'BAD_INDENT', startColMsg);
            }
            if (!keyProps.anchor && !keyProps.tag && !sep) {
                commentEnd = keyProps.end;
                if (keyProps.comment) {
                    if (map.comment)
                        map.comment += '\n' + keyProps.comment;
                    else
                        map.comment = keyProps.comment;
                }
                continue;
            }
            if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
                onError(key ?? start[start.length - 1], 'MULTILINE_IMPLICIT_KEY', 'Implicit keys need to be on a single line');
            }
        }
        else if (keyProps.found?.indent !== bm.indent) {
            onError(offset, 'BAD_INDENT', startColMsg);
        }
        // key value
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key
            ? composeNode(ctx, key, keyProps, onError)
            : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
            onError(keyStart, 'DUPLICATE_KEY', 'Map keys must be unique');
        // value properties
        const valueProps = resolveProps.resolveProps(sep ?? [], {
            indicator: 'map-value-ind',
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: bm.indent,
            startOnNewline: !key || key.type === 'block-scalar'
        });
        offset = valueProps.end;
        if (valueProps.found) {
            if (implicitKey) {
                if (value?.type === 'block-map' && !valueProps.hasNewline)
                    onError(offset, 'BLOCK_AS_IMPLICIT_KEY', 'Nested mappings are not allowed in compact mappings');
                if (ctx.options.strict &&
                    keyProps.start < valueProps.found.offset - 1024)
                    onError(keyNode.range, 'KEY_OVER_1024_CHARS', 'The : indicator must be at most 1024 chars after the start of an implicit block mapping key');
            }
            // value value
            const valueNode = value
                ? composeNode(ctx, value, valueProps, onError)
                : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
            if (ctx.schema.compat)
                utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
            offset = valueNode.range[2];
            const pair = new Pair.Pair(keyNode, valueNode);
            if (ctx.options.keepSourceTokens)
                pair.srcToken = collItem;
            map.items.push(pair);
        }
        else {
            // key with no value
            if (implicitKey)
                onError(keyNode.range, 'MISSING_CHAR', 'Implicit map keys need to be followed by map values');
            if (valueProps.comment) {
                if (keyNode.comment)
                    keyNode.comment += '\n' + valueProps.comment;
                else
                    keyNode.comment = valueProps.comment;
            }
            const pair = new Pair.Pair(keyNode);
            if (ctx.options.keepSourceTokens)
                pair.srcToken = collItem;
            map.items.push(pair);
        }
    }
    if (commentEnd && commentEnd < offset)
        onError(commentEnd, 'IMPOSSIBLE', 'Map comment with trailing content');
    map.range = [bm.offset, offset, commentEnd ?? offset];
    return map;
}

exports.resolveBlockMap = resolveBlockMap;


/***/ }),

/***/ 8913:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(3301);

function resolveBlockScalar(ctx, scalar, onError) {
    const start = scalar.offset;
    const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
    if (!header)
        return { value: '', type: null, comment: '', range: [start, start, start] };
    const type = header.mode === '>' ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
    const lines = scalar.source ? splitLines(scalar.source) : [];
    // determine the end of content & start of chomping
    let chompStart = lines.length;
    for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === '' || content === '\r')
            chompStart = i;
        else
            break;
    }
    // shortcut for empty contents
    if (chompStart === 0) {
        const value = header.chomp === '+' && lines.length > 0
            ? '\n'.repeat(Math.max(1, lines.length - 1))
            : '';
        let end = start + header.length;
        if (scalar.source)
            end += scalar.source.length;
        return { value, type, comment: header.comment, range: [start, end, end] };
    }
    // find the indentation level to trim from start
    let trimIndent = scalar.indent + header.indent;
    let offset = scalar.offset + header.length;
    let contentStart = 0;
    for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === '' || content === '\r') {
            if (header.indent === 0 && indent.length > trimIndent)
                trimIndent = indent.length;
        }
        else {
            if (indent.length < trimIndent) {
                const message = 'Block scalars with more-indented leading empty lines must use an explicit indentation indicator';
                onError(offset + indent.length, 'MISSING_CHAR', message);
            }
            if (header.indent === 0)
                trimIndent = indent.length;
            contentStart = i;
            if (trimIndent === 0 && !ctx.atRoot) {
                const message = 'Block scalar values in collections must be indented';
                onError(offset, 'BAD_INDENT', message);
            }
            break;
        }
        offset += indent.length + content.length + 1;
    }
    // include trailing more-indented empty lines in content
    for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
            chompStart = i + 1;
    }
    let value = '';
    let sep = '';
    let prevMoreIndented = false;
    // leading whitespace is kept intact
    for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + '\n';
    for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === '\r';
        if (crlf)
            content = content.slice(0, -1);
        /* istanbul ignore if already caught in lexer */
        if (content && indent.length < trimIndent) {
            const src = header.indent
                ? 'explicit indentation indicator'
                : 'first line';
            const message = `Block scalar lines must not be less indented than their ${src}`;
            onError(offset - content.length - (crlf ? 2 : 1), 'BAD_INDENT', message);
            indent = '';
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
            value += sep + indent.slice(trimIndent) + content;
            sep = '\n';
        }
        else if (indent.length > trimIndent || content[0] === '\t') {
            // more-indented content within a folded block
            if (sep === ' ')
                sep = '\n';
            else if (!prevMoreIndented && sep === '\n')
                sep = '\n\n';
            value += sep + indent.slice(trimIndent) + content;
            sep = '\n';
            prevMoreIndented = true;
        }
        else if (content === '') {
            // empty line
            if (sep === '\n')
                value += '\n';
            else
                sep = '\n';
        }
        else {
            value += sep + content;
            sep = ' ';
            prevMoreIndented = false;
        }
    }
    switch (header.chomp) {
        case '-':
            break;
        case '+':
            for (let i = chompStart; i < lines.length; ++i)
                value += '\n' + lines[i][0].slice(trimIndent);
            if (value[value.length - 1] !== '\n')
                value += '\n';
            break;
        default:
            value += '\n';
    }
    const end = start + header.length + scalar.source.length;
    return { value, type, comment: header.comment, range: [start, end, end] };
}
function parseBlockScalarHeader({ offset, props }, strict, onError) {
    /* istanbul ignore if should not happen */
    if (props[0].type !== 'block-scalar-header') {
        onError(props[0], 'IMPOSSIBLE', 'Block scalar header not found');
        return null;
    }
    const { source } = props[0];
    const mode = source[0];
    let indent = 0;
    let chomp = '';
    let error = -1;
    for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === '-' || ch === '+'))
            chomp = ch;
        else {
            const n = Number(ch);
            if (!indent && n)
                indent = n;
            else if (error === -1)
                error = offset + i;
        }
    }
    if (error !== -1)
        onError(error, 'UNEXPECTED_TOKEN', `Block scalar header includes extra characters: ${source}`);
    let hasSpace = false;
    let comment = '';
    let length = source.length;
    for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
            case 'space':
                hasSpace = true;
            // fallthrough
            case 'newline':
                length += token.source.length;
                break;
            case 'comment':
                if (strict && !hasSpace) {
                    const message = 'Comments must be separated from other tokens by white space characters';
                    onError(token, 'MISSING_CHAR', message);
                }
                length += token.source.length;
                comment = token.source.substring(1);
                break;
            case 'error':
                onError(token, 'UNEXPECTED_TOKEN', token.message);
                length += token.source.length;
                break;
            /* istanbul ignore next should not happen */
            default: {
                const message = `Unexpected token in block scalar header: ${token.type}`;
                onError(token, 'UNEXPECTED_TOKEN', message);
                const ts = token.source;
                if (ts && typeof ts === 'string')
                    length += ts.length;
            }
        }
    }
    return { mode, indent, chomp, comment, length };
}
/** @returns Array of lines split up as `[indent, content]` */
function splitLines(source) {
    const split = source.split(/\n( *)/);
    const first = split[0];
    const m = first.match(/^( *)/);
    const line0 = m?.[1]
        ? [m[1], first.slice(m[1].length)]
        : ['', first];
    const lines = [line0];
    for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
    return lines;
}

exports.resolveBlockScalar = resolveBlockScalar;


/***/ }),

/***/ 334:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var YAMLSeq = __nccwpck_require__(2223);
var resolveProps = __nccwpck_require__(4631);
var utilFlowIndentCheck = __nccwpck_require__(4051);

function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
    const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
    const seq = new NodeClass(ctx.schema);
    if (ctx.atRoot)
        ctx.atRoot = false;
    if (ctx.atKey)
        ctx.atKey = false;
    let offset = bs.offset;
    let commentEnd = null;
    for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
            indicator: 'seq-item-ind',
            next: value,
            offset,
            onError,
            parentIndent: bs.indent,
            startOnNewline: true
        });
        if (!props.found) {
            if (props.anchor || props.tag || value) {
                if (value?.type === 'block-seq')
                    onError(props.end, 'BAD_INDENT', 'All sequence items must start at the same column');
                else
                    onError(offset, 'MISSING_CHAR', 'Sequence item without - indicator');
            }
            else {
                commentEnd = props.end;
                if (props.comment)
                    seq.comment = props.comment;
                continue;
            }
        }
        const node = value
            ? composeNode(ctx, value, props, onError)
            : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
    }
    seq.range = [bs.offset, offset, commentEnd ?? offset];
    return seq;
}

exports.resolveBlockSeq = resolveBlockSeq;


/***/ }),

/***/ 7788:
/***/ ((__unused_webpack_module, exports) => {



function resolveEnd(end, offset, reqSpace, onError) {
    let comment = '';
    if (end) {
        let hasSpace = false;
        let sep = '';
        for (const token of end) {
            const { source, type } = token;
            switch (type) {
                case 'space':
                    hasSpace = true;
                    break;
                case 'comment': {
                    if (reqSpace && !hasSpace)
                        onError(token, 'MISSING_CHAR', 'Comments must be separated from other tokens by white space characters');
                    const cb = source.substring(1) || ' ';
                    if (!comment)
                        comment = cb;
                    else
                        comment += sep + cb;
                    sep = '';
                    break;
                }
                case 'newline':
                    if (comment)
                        sep += source;
                    hasSpace = true;
                    break;
                default:
                    onError(token, 'UNEXPECTED_TOKEN', `Unexpected ${type} at node end`);
            }
            offset += source.length;
        }
    }
    return { comment, offset };
}

exports.resolveEnd = resolveEnd;


/***/ }),

/***/ 3142:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var Pair = __nccwpck_require__(7165);
var YAMLMap = __nccwpck_require__(4454);
var YAMLSeq = __nccwpck_require__(2223);
var resolveEnd = __nccwpck_require__(7788);
var resolveProps = __nccwpck_require__(4631);
var utilContainsNewline = __nccwpck_require__(9499);
var utilMapIncludes = __nccwpck_require__(1187);

const blockMsg = 'Block collections are not allowed within flow collections';
const isBlock = (token) => token && (token.type === 'block-map' || token.type === 'block-seq');
function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
    const isMap = fc.start.source === '{';
    const fcName = isMap ? 'flow map' : 'flow sequence';
    const NodeClass = (tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq));
    const coll = new NodeClass(ctx.schema);
    coll.flow = true;
    const atRoot = ctx.atRoot;
    if (atRoot)
        ctx.atRoot = false;
    if (ctx.atKey)
        ctx.atKey = false;
    let offset = fc.offset + fc.start.source.length;
    for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
            flow: fcName,
            indicator: 'explicit-key-ind',
            next: key ?? sep?.[0],
            offset,
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
        });
        if (!props.found) {
            if (!props.anchor && !props.tag && !sep && !value) {
                if (i === 0 && props.comma)
                    onError(props.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${fcName}`);
                else if (i < fc.items.length - 1)
                    onError(props.start, 'UNEXPECTED_TOKEN', `Unexpected empty item in ${fcName}`);
                if (props.comment) {
                    if (coll.comment)
                        coll.comment += '\n' + props.comment;
                    else
                        coll.comment = props.comment;
                }
                offset = props.end;
                continue;
            }
            if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
                onError(key, // checked by containsNewline()
                'MULTILINE_IMPLICIT_KEY', 'Implicit keys of flow sequence pairs need to be on a single line');
        }
        if (i === 0) {
            if (props.comma)
                onError(props.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${fcName}`);
        }
        else {
            if (!props.comma)
                onError(props.start, 'MISSING_CHAR', `Missing , between ${fcName} items`);
            if (props.comment) {
                let prevItemComment = '';
                loop: for (const st of start) {
                    switch (st.type) {
                        case 'comma':
                        case 'space':
                            break;
                        case 'comment':
                            prevItemComment = st.source.substring(1);
                            break loop;
                        default:
                            break loop;
                    }
                }
                if (prevItemComment) {
                    let prev = coll.items[coll.items.length - 1];
                    if (identity.isPair(prev))
                        prev = prev.value ?? prev.key;
                    if (prev.comment)
                        prev.comment += '\n' + prevItemComment;
                    else
                        prev.comment = prevItemComment;
                    props.comment = props.comment.substring(prevItemComment.length + 1);
                }
            }
        }
        if (!isMap && !sep && !props.found) {
            // item is a value in a seq
            // → key & sep are empty, start does not include ? or :
            const valueNode = value
                ? composeNode(ctx, value, props, onError)
                : composeEmptyNode(ctx, props.end, sep, null, props, onError);
            coll.items.push(valueNode);
            offset = valueNode.range[2];
            if (isBlock(value))
                onError(valueNode.range, 'BLOCK_IN_FLOW', blockMsg);
        }
        else {
            // item is a key+value pair
            // key value
            ctx.atKey = true;
            const keyStart = props.end;
            const keyNode = key
                ? composeNode(ctx, key, props, onError)
                : composeEmptyNode(ctx, keyStart, start, null, props, onError);
            if (isBlock(key))
                onError(keyNode.range, 'BLOCK_IN_FLOW', blockMsg);
            ctx.atKey = false;
            // value properties
            const valueProps = resolveProps.resolveProps(sep ?? [], {
                flow: fcName,
                indicator: 'map-value-ind',
                next: value,
                offset: keyNode.range[2],
                onError,
                parentIndent: fc.indent,
                startOnNewline: false
            });
            if (valueProps.found) {
                if (!isMap && !props.found && ctx.options.strict) {
                    if (sep)
                        for (const st of sep) {
                            if (st === valueProps.found)
                                break;
                            if (st.type === 'newline') {
                                onError(st, 'MULTILINE_IMPLICIT_KEY', 'Implicit keys of flow sequence pairs need to be on a single line');
                                break;
                            }
                        }
                    if (props.start < valueProps.found.offset - 1024)
                        onError(valueProps.found, 'KEY_OVER_1024_CHARS', 'The : indicator must be at most 1024 chars after the start of an implicit flow sequence key');
                }
            }
            else if (value) {
                if ('source' in value && value.source?.[0] === ':')
                    onError(value, 'MISSING_CHAR', `Missing space after : in ${fcName}`);
                else
                    onError(valueProps.start, 'MISSING_CHAR', `Missing , or : between ${fcName} items`);
            }
            // value value
            const valueNode = value
                ? composeNode(ctx, value, valueProps, onError)
                : valueProps.found
                    ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError)
                    : null;
            if (valueNode) {
                if (isBlock(value))
                    onError(valueNode.range, 'BLOCK_IN_FLOW', blockMsg);
            }
            else if (valueProps.comment) {
                if (keyNode.comment)
                    keyNode.comment += '\n' + valueProps.comment;
                else
                    keyNode.comment = valueProps.comment;
            }
            const pair = new Pair.Pair(keyNode, valueNode);
            if (ctx.options.keepSourceTokens)
                pair.srcToken = collItem;
            if (isMap) {
                const map = coll;
                if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
                    onError(keyStart, 'DUPLICATE_KEY', 'Map keys must be unique');
                map.items.push(pair);
            }
            else {
                const map = new YAMLMap.YAMLMap(ctx.schema);
                map.flow = true;
                map.items.push(pair);
                const endRange = (valueNode ?? keyNode).range;
                map.range = [keyNode.range[0], endRange[1], endRange[2]];
                coll.items.push(map);
            }
            offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
    }
    const expectedEnd = isMap ? '}' : ']';
    const [ce, ...ee] = fc.end;
    let cePos = offset;
    if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
    else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot
            ? `${name} must end with a ${expectedEnd}`
            : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? 'MISSING_CHAR' : 'BAD_INDENT', msg);
        if (ce && ce.source.length !== 1)
            ee.unshift(ce);
    }
    if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
            if (coll.comment)
                coll.comment += '\n' + end.comment;
            else
                coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
    }
    else {
        coll.range = [fc.offset, cePos, cePos];
    }
    return coll;
}

exports.resolveFlowCollection = resolveFlowCollection;


/***/ }),

/***/ 6842:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(3301);
var resolveEnd = __nccwpck_require__(7788);

function resolveFlowScalar(scalar, strict, onError) {
    const { offset, type, source, end } = scalar;
    let _type;
    let value;
    const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
    switch (type) {
        case 'scalar':
            _type = Scalar.Scalar.PLAIN;
            value = plainValue(source, _onError);
            break;
        case 'single-quoted-scalar':
            _type = Scalar.Scalar.QUOTE_SINGLE;
            value = singleQuotedValue(source, _onError);
            break;
        case 'double-quoted-scalar':
            _type = Scalar.Scalar.QUOTE_DOUBLE;
            value = doubleQuotedValue(source, _onError);
            break;
        /* istanbul ignore next should not happen */
        default:
            onError(scalar, 'UNEXPECTED_TOKEN', `Expected a flow scalar value, but found: ${type}`);
            return {
                value: '',
                type: null,
                comment: '',
                range: [offset, offset + source.length, offset + source.length]
            };
    }
    const valueEnd = offset + source.length;
    const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
    return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
    };
}
function plainValue(source, onError) {
    let badChar = '';
    switch (source[0]) {
        /* istanbul ignore next should not happen */
        case '\t':
            badChar = 'a tab character';
            break;
        case ',':
            badChar = 'flow indicator character ,';
            break;
        case '%':
            badChar = 'directive indicator character %';
            break;
        case '|':
        case '>': {
            badChar = `block scalar indicator ${source[0]}`;
            break;
        }
        case '@':
        case '`': {
            badChar = `reserved character ${source[0]}`;
            break;
        }
    }
    if (badChar)
        onError(0, 'BAD_SCALAR_START', `Plain value cannot start with ${badChar}`);
    return foldLines(source);
}
function singleQuotedValue(source, onError) {
    if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, 'MISSING_CHAR', "Missing closing 'quote");
    return foldLines(source.slice(1, -1)).replace(/''/g, "'");
}
function foldLines(source) {
    /**
     * The negative lookbehind here and in the `re` RegExp is to
     * prevent causing a polynomial search time in certain cases.
     *
     * The try-catch is for Safari, which doesn't support this yet:
     * https://caniuse.com/js-regexp-lookbehind
     */
    let first, line;
    try {
        first = new RegExp('(.*?)(?<![ \t])[ \t]*\r?\n', 'sy');
        line = new RegExp('[ \t]*(.*?)(?:(?<![ \t])[ \t]*)?\r?\n', 'sy');
    }
    catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
    }
    let match = first.exec(source);
    if (!match)
        return source;
    let res = match[1];
    let sep = ' ';
    let pos = first.lastIndex;
    line.lastIndex = pos;
    while ((match = line.exec(source))) {
        if (match[1] === '') {
            if (sep === '\n')
                res += sep;
            else
                sep = '\n';
        }
        else {
            res += sep + match[1];
            sep = ' ';
        }
        pos = line.lastIndex;
    }
    const last = /[ \t]*(.*)/sy;
    last.lastIndex = pos;
    match = last.exec(source);
    return res + sep + (match?.[1] ?? '');
}
function doubleQuotedValue(source, onError) {
    let res = '';
    for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === '\r' && source[i + 1] === '\n')
            continue;
        if (ch === '\n') {
            const { fold, offset } = foldNewline(source, i);
            res += fold;
            i = offset;
        }
        else if (ch === '\\') {
            let next = source[++i];
            const cc = escapeCodes[next];
            if (cc)
                res += cc;
            else if (next === '\n') {
                // skip escaped newlines, but still trim the following line
                next = source[i + 1];
                while (next === ' ' || next === '\t')
                    next = source[++i + 1];
            }
            else if (next === '\r' && source[i + 1] === '\n') {
                // skip escaped CRLF newlines, but still trim the following line
                next = source[++i + 1];
                while (next === ' ' || next === '\t')
                    next = source[++i + 1];
            }
            else if (next === 'x' || next === 'u' || next === 'U') {
                const length = next === 'x' ? 2 : next === 'u' ? 4 : 8;
                res += parseCharCode(source, i + 1, length, onError);
                i += length;
            }
            else {
                const raw = source.substr(i - 1, 2);
                onError(i - 1, 'BAD_DQ_ESCAPE', `Invalid escape sequence ${raw}`);
                res += raw;
            }
        }
        else if (ch === ' ' || ch === '\t') {
            // trim trailing whitespace
            const wsStart = i;
            let next = source[i + 1];
            while (next === ' ' || next === '\t')
                next = source[++i + 1];
            if (next !== '\n' && !(next === '\r' && source[i + 2] === '\n'))
                res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        }
        else {
            res += ch;
        }
    }
    if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, 'MISSING_CHAR', 'Missing closing "quote');
    return res;
}
/**
 * Fold a single newline into a space, multiple newlines to N - 1 newlines.
 * Presumes `source[offset] === '\n'`
 */
function foldNewline(source, offset) {
    let fold = '';
    let ch = source[offset + 1];
    while (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        if (ch === '\r' && source[offset + 2] !== '\n')
            break;
        if (ch === '\n')
            fold += '\n';
        offset += 1;
        ch = source[offset + 1];
    }
    if (!fold)
        fold = ' ';
    return { fold, offset };
}
const escapeCodes = {
    '0': '\0', // null character
    a: '\x07', // bell character
    b: '\b', // backspace
    e: '\x1b', // escape character
    f: '\f', // form feed
    n: '\n', // line feed
    r: '\r', // carriage return
    t: '\t', // horizontal tab
    v: '\v', // vertical tab
    N: '\u0085', // Unicode next line
    _: '\u00a0', // Unicode non-breaking space
    L: '\u2028', // Unicode line separator
    P: '\u2029', // Unicode paragraph separator
    ' ': ' ',
    '"': '"',
    '/': '/',
    '\\': '\\',
    '\t': '\t'
};
function parseCharCode(source, offset, length, onError) {
    const cc = source.substr(offset, length);
    const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
    const code = ok ? parseInt(cc, 16) : NaN;
    try {
        return String.fromCodePoint(code);
    }
    catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, 'BAD_DQ_ESCAPE', `Invalid escape sequence ${raw}`);
        return raw;
    }
}

exports.resolveFlowScalar = resolveFlowScalar;


/***/ }),

/***/ 4631:
/***/ ((__unused_webpack_module, exports) => {



function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
    let spaceBefore = false;
    let atNewline = startOnNewline;
    let hasSpace = startOnNewline;
    let comment = '';
    let commentSep = '';
    let hasNewline = false;
    let reqSpace = false;
    let tab = null;
    let anchor = null;
    let tag = null;
    let newlineAfterProp = null;
    let comma = null;
    let found = null;
    let start = null;
    for (const token of tokens) {
        if (reqSpace) {
            if (token.type !== 'space' &&
                token.type !== 'newline' &&
                token.type !== 'comma')
                onError(token.offset, 'MISSING_CHAR', 'Tags and anchors must be separated from the next token by white space');
            reqSpace = false;
        }
        if (tab) {
            if (atNewline && token.type !== 'comment' && token.type !== 'newline') {
                onError(tab, 'TAB_AS_INDENT', 'Tabs are not allowed as indentation');
            }
            tab = null;
        }
        switch (token.type) {
            case 'space':
                // At the doc level, tabs at line start may be parsed
                // as leading white space rather than indentation.
                // In a flow collection, only the parser handles indent.
                if (!flow &&
                    (indicator !== 'doc-start' || next?.type !== 'flow-collection') &&
                    token.source.includes('\t')) {
                    tab = token;
                }
                hasSpace = true;
                break;
            case 'comment': {
                if (!hasSpace)
                    onError(token, 'MISSING_CHAR', 'Comments must be separated from other tokens by white space characters');
                const cb = token.source.substring(1) || ' ';
                if (!comment)
                    comment = cb;
                else
                    comment += commentSep + cb;
                commentSep = '';
                atNewline = false;
                break;
            }
            case 'newline':
                if (atNewline) {
                    if (comment)
                        comment += token.source;
                    else if (!found || indicator !== 'seq-item-ind')
                        spaceBefore = true;
                }
                else
                    commentSep += token.source;
                atNewline = true;
                hasNewline = true;
                if (anchor || tag)
                    newlineAfterProp = token;
                hasSpace = true;
                break;
            case 'anchor':
                if (anchor)
                    onError(token, 'MULTIPLE_ANCHORS', 'A node can have at most one anchor');
                if (token.source.endsWith(':'))
                    onError(token.offset + token.source.length - 1, 'BAD_ALIAS', 'Anchor ending in : is ambiguous', true);
                anchor = token;
                start ?? (start = token.offset);
                atNewline = false;
                hasSpace = false;
                reqSpace = true;
                break;
            case 'tag': {
                if (tag)
                    onError(token, 'MULTIPLE_TAGS', 'A node can have at most one tag');
                tag = token;
                start ?? (start = token.offset);
                atNewline = false;
                hasSpace = false;
                reqSpace = true;
                break;
            }
            case indicator:
                // Could here handle preceding comments differently
                if (anchor || tag)
                    onError(token, 'BAD_PROP_ORDER', `Anchors and tags must be after the ${token.source} indicator`);
                if (found)
                    onError(token, 'UNEXPECTED_TOKEN', `Unexpected ${token.source} in ${flow ?? 'collection'}`);
                found = token;
                atNewline =
                    indicator === 'seq-item-ind' || indicator === 'explicit-key-ind';
                hasSpace = false;
                break;
            case 'comma':
                if (flow) {
                    if (comma)
                        onError(token, 'UNEXPECTED_TOKEN', `Unexpected , in ${flow}`);
                    comma = token;
                    atNewline = false;
                    hasSpace = false;
                    break;
                }
            // else fallthrough
            default:
                onError(token, 'UNEXPECTED_TOKEN', `Unexpected ${token.type} token`);
                atNewline = false;
                hasSpace = false;
        }
    }
    const last = tokens[tokens.length - 1];
    const end = last ? last.offset + last.source.length : offset;
    if (reqSpace &&
        next &&
        next.type !== 'space' &&
        next.type !== 'newline' &&
        next.type !== 'comma' &&
        (next.type !== 'scalar' || next.source !== '')) {
        onError(next.offset, 'MISSING_CHAR', 'Tags and anchors must be separated from the next token by white space');
    }
    if (tab &&
        ((atNewline && tab.indent <= parentIndent) ||
            next?.type === 'block-map' ||
            next?.type === 'block-seq'))
        onError(tab, 'TAB_AS_INDENT', 'Tabs are not allowed as indentation');
    return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
    };
}

exports.resolveProps = resolveProps;


/***/ }),

/***/ 9499:
/***/ ((__unused_webpack_module, exports) => {



function containsNewline(key) {
    if (!key)
        return null;
    switch (key.type) {
        case 'alias':
        case 'scalar':
        case 'double-quoted-scalar':
        case 'single-quoted-scalar':
            if (key.source.includes('\n'))
                return true;
            if (key.end)
                for (const st of key.end)
                    if (st.type === 'newline')
                        return true;
            return false;
        case 'flow-collection':
            for (const it of key.items) {
                for (const st of it.start)
                    if (st.type === 'newline')
                        return true;
                if (it.sep)
                    for (const st of it.sep)
                        if (st.type === 'newline')
                            return true;
                if (containsNewline(it.key) || containsNewline(it.value))
                    return true;
            }
            return false;
        default:
            return true;
    }
}

exports.containsNewline = containsNewline;


/***/ }),

/***/ 2599:
/***/ ((__unused_webpack_module, exports) => {



function emptyScalarPosition(offset, before, pos) {
    if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
            let st = before[i];
            switch (st.type) {
                case 'space':
                case 'comment':
                case 'newline':
                    offset -= st.source.length;
                    continue;
            }
            // Technically, an empty scalar is immediately after the last non-empty
            // node, but it's more useful to place it after any whitespace.
            st = before[++i];
            while (st?.type === 'space') {
                offset += st.source.length;
                st = before[++i];
            }
            break;
        }
    }
    return offset;
}

exports.emptyScalarPosition = emptyScalarPosition;


/***/ }),

/***/ 4051:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var utilContainsNewline = __nccwpck_require__(9499);

function flowIndentCheck(indent, fc, onError) {
    if (fc?.type === 'flow-collection') {
        const end = fc.end[0];
        if (end.indent === indent &&
            (end.source === ']' || end.source === '}') &&
            utilContainsNewline.containsNewline(fc)) {
            const msg = 'Flow end indicator should be more indented than parent';
            onError(end, 'BAD_INDENT', msg, true);
        }
    }
}

exports.flowIndentCheck = flowIndentCheck;


/***/ }),

/***/ 1187:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);

function mapIncludes(ctx, items, search) {
    const { uniqueKeys } = ctx.options;
    if (uniqueKeys === false)
        return false;
    const isEqual = typeof uniqueKeys === 'function'
        ? uniqueKeys
        : (a, b) => a === b || (identity.isScalar(a) && identity.isScalar(b) && a.value === b.value);
    return items.some(pair => isEqual(pair.key, search));
}

exports.mapIncludes = mapIncludes;


/***/ }),

/***/ 3021:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Alias = __nccwpck_require__(4065);
var Collection = __nccwpck_require__(101);
var identity = __nccwpck_require__(1127);
var Pair = __nccwpck_require__(7165);
var toJS = __nccwpck_require__(4043);
var Schema = __nccwpck_require__(5840);
var stringifyDocument = __nccwpck_require__(6829);
var anchors = __nccwpck_require__(1596);
var applyReviver = __nccwpck_require__(3661);
var createNode = __nccwpck_require__(2404);
var directives = __nccwpck_require__(1342);

class Document {
    constructor(value, replacer, options) {
        /** A comment before this Document */
        this.commentBefore = null;
        /** A comment immediately after this Document */
        this.comment = null;
        /** Errors encountered during parsing. */
        this.errors = [];
        /** Warnings encountered during parsing. */
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === 'function' || Array.isArray(replacer)) {
            _replacer = replacer;
        }
        else if (options === undefined && replacer) {
            options = replacer;
            replacer = undefined;
        }
        const opt = Object.assign({
            intAsBigInt: false,
            keepSourceTokens: false,
            logLevel: 'warn',
            prettyErrors: true,
            strict: true,
            stringKeys: false,
            uniqueKeys: true,
            version: '1.2'
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
            this.directives = options._directives.atDocument();
            if (this.directives.yaml.explicit)
                version = this.directives.yaml.version;
        }
        else
            this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        // @ts-expect-error We can't really know that this matches Contents.
        this.contents =
            value === undefined ? null : this.createNode(value, _replacer, options);
    }
    /**
     * Create a deep copy of this Document and its contents.
     *
     * Custom Node values that inherit from `Object` still refer to their original instances.
     */
    clone() {
        const copy = Object.create(Document.prototype, {
            [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
            copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        // @ts-expect-error We can't really know that this matches Contents.
        copy.contents = identity.isNode(this.contents)
            ? this.contents.clone(copy.schema)
            : this.contents;
        if (this.range)
            copy.range = this.range.slice();
        return copy;
    }
    /** Adds a value to the document. */
    add(value) {
        if (assertCollection(this.contents))
            this.contents.add(value);
    }
    /** Adds a value to the document. */
    addIn(path, value) {
        if (assertCollection(this.contents))
            this.contents.addIn(path, value);
    }
    /**
     * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
     *
     * If `node` already has an anchor, `name` is ignored.
     * Otherwise, the `node.anchor` value will be set to `name`,
     * or if an anchor with that name is already present in the document,
     * `name` will be used as a prefix for a new unique anchor.
     * If `name` is undefined, the generated anchor will use 'a' as a prefix.
     */
    createAlias(node, name) {
        if (!node.anchor) {
            const prev = anchors.anchorNames(this);
            node.anchor =
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                !name || prev.has(name) ? anchors.findNewAnchor(name || 'a', prev) : name;
        }
        return new Alias.Alias(node.anchor);
    }
    createNode(value, replacer, options) {
        let _replacer = undefined;
        if (typeof replacer === 'function') {
            value = replacer.call({ '': value }, '', value);
            _replacer = replacer;
        }
        else if (Array.isArray(replacer)) {
            const keyToStr = (v) => typeof v === 'number' || v instanceof String || v instanceof Number;
            const asStr = replacer.filter(keyToStr).map(String);
            if (asStr.length > 0)
                replacer = replacer.concat(asStr);
            _replacer = replacer;
        }
        else if (options === undefined && replacer) {
            options = replacer;
            replacer = undefined;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(this, 
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        anchorPrefix || 'a');
        const ctx = {
            aliasDuplicateObjects: aliasDuplicateObjects ?? true,
            keepUndefined: keepUndefined ?? false,
            onAnchor,
            onTagObj,
            replacer: _replacer,
            schema: this.schema,
            sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
            node.flow = true;
        setAnchors();
        return node;
    }
    /**
     * Convert a key and a value into a `Pair` using the current schema,
     * recursively wrapping all values as `Scalar` or `Collection` nodes.
     */
    createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
    }
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
    }
    /**
     * Removes a value from the document.
     * @returns `true` if the item was found and removed.
     */
    deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
            if (this.contents == null)
                return false;
            // @ts-expect-error Presumed impossible if Strict extends false
            this.contents = null;
            return true;
        }
        return assertCollection(this.contents)
            ? this.contents.deleteIn(path)
            : false;
    }
    /**
     * Returns item at `key`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    get(key, keepScalar) {
        return identity.isCollection(this.contents)
            ? this.contents.get(key, keepScalar)
            : undefined;
    }
    /**
     * Returns item at `path`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
            return !keepScalar && identity.isScalar(this.contents)
                ? this.contents.value
                : this.contents;
        return identity.isCollection(this.contents)
            ? this.contents.getIn(path, keepScalar)
            : undefined;
    }
    /**
     * Checks if the document includes a value with the key `key`.
     */
    has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
    }
    /**
     * Checks if the document includes a value at `path`.
     */
    hasIn(path) {
        if (Collection.isEmptyPath(path))
            return this.contents !== undefined;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
    }
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    set(key, value) {
        if (this.contents == null) {
            // @ts-expect-error We can't really know that this matches Contents.
            this.contents = Collection.collectionFromPath(this.schema, [key], value);
        }
        else if (assertCollection(this.contents)) {
            this.contents.set(key, value);
        }
    }
    /**
     * Sets a value in this document. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
            // @ts-expect-error We can't really know that this matches Contents.
            this.contents = value;
        }
        else if (this.contents == null) {
            // @ts-expect-error We can't really know that this matches Contents.
            this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        }
        else if (assertCollection(this.contents)) {
            this.contents.setIn(path, value);
        }
    }
    /**
     * Change the YAML version and schema used by the document.
     * A `null` version disables support for directives, explicit tags, anchors, and aliases.
     * It also requires the `schema` option to be given as a `Schema` instance value.
     *
     * Overrides all previously set schema options.
     */
    setSchema(version, options = {}) {
        if (typeof version === 'number')
            version = String(version);
        let opt;
        switch (version) {
            case '1.1':
                if (this.directives)
                    this.directives.yaml.version = '1.1';
                else
                    this.directives = new directives.Directives({ version: '1.1' });
                opt = { resolveKnownTags: false, schema: 'yaml-1.1' };
                break;
            case '1.2':
            case 'next':
                if (this.directives)
                    this.directives.yaml.version = version;
                else
                    this.directives = new directives.Directives({ version });
                opt = { resolveKnownTags: true, schema: 'core' };
                break;
            case null:
                if (this.directives)
                    delete this.directives;
                opt = null;
                break;
            default: {
                const sv = JSON.stringify(version);
                throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
            }
        }
        // Not using `instanceof Schema` to allow for duck typing
        if (options.schema instanceof Object)
            this.schema = options.schema;
        else if (opt)
            this.schema = new Schema.Schema(Object.assign(opt, options));
        else
            throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
    }
    // json & jsonArg are only used from toJSON()
    toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
            anchors: new Map(),
            doc: this,
            keep: !json,
            mapAsMap: mapAsMap === true,
            mapKeyWarned: false,
            maxAliasCount: typeof maxAliasCount === 'number' ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? '', ctx);
        if (typeof onAnchor === 'function')
            for (const { count, res } of ctx.anchors.values())
                onAnchor(res, count);
        return typeof reviver === 'function'
            ? applyReviver.applyReviver(reviver, { '': res }, '', res)
            : res;
    }
    /**
     * A JSON representation of the document `contents`.
     *
     * @param jsonArg Used by `JSON.stringify` to indicate the array index or
     *   property name.
     */
    toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
    }
    /** A YAML representation of the document. */
    toString(options = {}) {
        if (this.errors.length > 0)
            throw new Error('Document with errors cannot be stringified');
        if ('indent' in options &&
            (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
            const s = JSON.stringify(options.indent);
            throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
    }
}
function assertCollection(contents) {
    if (identity.isCollection(contents))
        return true;
    throw new Error('Expected a YAML collection as document contents');
}

exports.Document = Document;


/***/ }),

/***/ 1596:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var visit = __nccwpck_require__(204);

/**
 * Verify that the input string is a valid anchor.
 *
 * Will throw on errors.
 */
function anchorIsValid(anchor) {
    if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
    }
    return true;
}
function anchorNames(root) {
    const anchors = new Set();
    visit.visit(root, {
        Value(_key, node) {
            if (node.anchor)
                anchors.add(node.anchor);
        }
    });
    return anchors;
}
/** Find a new anchor name with the given `prefix` and a one-indexed suffix. */
function findNewAnchor(prefix, exclude) {
    for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
            return name;
    }
}
function createNodeAnchors(doc, prefix) {
    const aliasObjects = [];
    const sourceObjects = new Map();
    let prevAnchors = null;
    return {
        onAnchor: (source) => {
            aliasObjects.push(source);
            prevAnchors ?? (prevAnchors = anchorNames(doc));
            const anchor = findNewAnchor(prefix, prevAnchors);
            prevAnchors.add(anchor);
            return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
            for (const source of aliasObjects) {
                const ref = sourceObjects.get(source);
                if (typeof ref === 'object' &&
                    ref.anchor &&
                    (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
                    ref.node.anchor = ref.anchor;
                }
                else {
                    const error = new Error('Failed to resolve repeated object (this should not happen)');
                    error.source = source;
                    throw error;
                }
            }
        },
        sourceObjects
    };
}

exports.anchorIsValid = anchorIsValid;
exports.anchorNames = anchorNames;
exports.createNodeAnchors = createNodeAnchors;
exports.findNewAnchor = findNewAnchor;


/***/ }),

/***/ 3661:
/***/ ((__unused_webpack_module, exports) => {



/**
 * Applies the JSON.parse reviver algorithm as defined in the ECMA-262 spec,
 * in section 24.5.1.1 "Runtime Semantics: InternalizeJSONProperty" of the
 * 2021 edition: https://tc39.es/ecma262/#sec-json.parse
 *
 * Includes extensions for handling Map and Set objects.
 */
function applyReviver(reviver, obj, key, val) {
    if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
            for (let i = 0, len = val.length; i < len; ++i) {
                const v0 = val[i];
                const v1 = applyReviver(reviver, val, String(i), v0);
                // eslint-disable-next-line @typescript-eslint/no-array-delete
                if (v1 === undefined)
                    delete val[i];
                else if (v1 !== v0)
                    val[i] = v1;
            }
        }
        else if (val instanceof Map) {
            for (const k of Array.from(val.keys())) {
                const v0 = val.get(k);
                const v1 = applyReviver(reviver, val, k, v0);
                if (v1 === undefined)
                    val.delete(k);
                else if (v1 !== v0)
                    val.set(k, v1);
            }
        }
        else if (val instanceof Set) {
            for (const v0 of Array.from(val)) {
                const v1 = applyReviver(reviver, val, v0, v0);
                if (v1 === undefined)
                    val.delete(v0);
                else if (v1 !== v0) {
                    val.delete(v0);
                    val.add(v1);
                }
            }
        }
        else {
            for (const [k, v0] of Object.entries(val)) {
                const v1 = applyReviver(reviver, val, k, v0);
                if (v1 === undefined)
                    delete val[k];
                else if (v1 !== v0)
                    val[k] = v1;
            }
        }
    }
    return reviver.call(obj, key, val);
}

exports.applyReviver = applyReviver;


/***/ }),

/***/ 2404:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Alias = __nccwpck_require__(4065);
var identity = __nccwpck_require__(1127);
var Scalar = __nccwpck_require__(3301);

const defaultTagPrefix = 'tag:yaml.org,2002:';
function findTagObject(value, tagName, tags) {
    if (tagName) {
        const match = tags.filter(t => t.tag === tagName);
        const tagObj = match.find(t => !t.format) ?? match[0];
        if (!tagObj)
            throw new Error(`Tag ${tagName} not found`);
        return tagObj;
    }
    return tags.find(t => t.identify?.(value) && !t.format);
}
function createNode(value, tagName, ctx) {
    if (identity.isDocument(value))
        value = value.contents;
    if (identity.isNode(value))
        return value;
    if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
    }
    if (value instanceof String ||
        value instanceof Number ||
        value instanceof Boolean ||
        (typeof BigInt !== 'undefined' && value instanceof BigInt) // not supported everywhere
    ) {
        // https://tc39.es/ecma262/#sec-serializejsonproperty
        value = value.valueOf();
    }
    const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
    // Detect duplicate references to the same object & use Alias nodes for all
    // after first. The `ref` wrapper allows for circular references to resolve.
    let ref = undefined;
    if (aliasDuplicateObjects && value && typeof value === 'object') {
        ref = sourceObjects.get(value);
        if (ref) {
            ref.anchor ?? (ref.anchor = onAnchor(value));
            return new Alias.Alias(ref.anchor);
        }
        else {
            ref = { anchor: null, node: null };
            sourceObjects.set(value, ref);
        }
    }
    if (tagName?.startsWith('!!'))
        tagName = defaultTagPrefix + tagName.slice(2);
    let tagObj = findTagObject(value, tagName, schema.tags);
    if (!tagObj) {
        if (value && typeof value.toJSON === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            value = value.toJSON();
        }
        if (!value || typeof value !== 'object') {
            const node = new Scalar.Scalar(value);
            if (ref)
                ref.node = node;
            return node;
        }
        tagObj =
            value instanceof Map
                ? schema[identity.MAP]
                : Symbol.iterator in Object(value)
                    ? schema[identity.SEQ]
                    : schema[identity.MAP];
    }
    if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
    }
    const node = tagObj?.createNode
        ? tagObj.createNode(ctx.schema, value, ctx)
        : typeof tagObj?.nodeClass?.from === 'function'
            ? tagObj.nodeClass.from(ctx.schema, value, ctx)
            : new Scalar.Scalar(value);
    if (tagName)
        node.tag = tagName;
    else if (!tagObj.default)
        node.tag = tagObj.tag;
    if (ref)
        ref.node = node;
    return node;
}

exports.createNode = createNode;


/***/ }),

/***/ 1342:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var visit = __nccwpck_require__(204);

const escapeChars = {
    '!': '%21',
    ',': '%2C',
    '[': '%5B',
    ']': '%5D',
    '{': '%7B',
    '}': '%7D'
};
const escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, ch => escapeChars[ch]);
class Directives {
    constructor(yaml, tags) {
        /**
         * The directives-end/doc-start marker `---`. If `null`, a marker may still be
         * included in the document's stringified representation.
         */
        this.docStart = null;
        /** The doc-end marker `...`.  */
        this.docEnd = false;
        this.yaml = Object.assign({}, Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, Directives.defaultTags, tags);
    }
    clone() {
        const copy = new Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
    }
    /**
     * During parsing, get a Directives instance for the current document and
     * update the stream state according to the current version's spec.
     */
    atDocument() {
        const res = new Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
            case '1.1':
                this.atNextDocument = true;
                break;
            case '1.2':
                this.atNextDocument = false;
                this.yaml = {
                    explicit: Directives.defaultYaml.explicit,
                    version: '1.2'
                };
                this.tags = Object.assign({}, Directives.defaultTags);
                break;
        }
        return res;
    }
    /**
     * @param onError - May be called even if the action was successful
     * @returns `true` on success
     */
    add(line, onError) {
        if (this.atNextDocument) {
            this.yaml = { explicit: Directives.defaultYaml.explicit, version: '1.1' };
            this.tags = Object.assign({}, Directives.defaultTags);
            this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
            case '%TAG': {
                if (parts.length !== 2) {
                    onError(0, '%TAG directive should contain exactly two parts');
                    if (parts.length < 2)
                        return false;
                }
                const [handle, prefix] = parts;
                this.tags[handle] = prefix;
                return true;
            }
            case '%YAML': {
                this.yaml.explicit = true;
                if (parts.length !== 1) {
                    onError(0, '%YAML directive should contain exactly one part');
                    return false;
                }
                const [version] = parts;
                if (version === '1.1' || version === '1.2') {
                    this.yaml.version = version;
                    return true;
                }
                else {
                    const isValid = /^\d+\.\d+$/.test(version);
                    onError(6, `Unsupported YAML version ${version}`, isValid);
                    return false;
                }
            }
            default:
                onError(0, `Unknown directive ${name}`, true);
                return false;
        }
    }
    /**
     * Resolves a tag, matching handles to those defined in %TAG directives.
     *
     * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
     *   `'!local'` tag, or `null` if unresolvable.
     */
    tagName(source, onError) {
        if (source === '!')
            return '!'; // non-specific tag
        if (source[0] !== '!') {
            onError(`Not a valid tag: ${source}`);
            return null;
        }
        if (source[1] === '<') {
            const verbatim = source.slice(2, -1);
            if (verbatim === '!' || verbatim === '!!') {
                onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
                return null;
            }
            if (source[source.length - 1] !== '>')
                onError('Verbatim tags must end with a >');
            return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
            onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
            try {
                return prefix + decodeURIComponent(suffix);
            }
            catch (error) {
                onError(String(error));
                return null;
            }
        }
        if (handle === '!')
            return source; // local tag
        onError(`Could not resolve tag: ${source}`);
        return null;
    }
    /**
     * Given a fully resolved tag, returns its printable string form,
     * taking into account current tag prefixes and defaults.
     */
    tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
            if (tag.startsWith(prefix))
                return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === '!' ? tag : `!<${tag}>`;
    }
    toString(doc) {
        const lines = this.yaml.explicit
            ? [`%YAML ${this.yaml.version || '1.2'}`]
            : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
            const tags = {};
            visit.visit(doc.contents, (_key, node) => {
                if (identity.isNode(node) && node.tag)
                    tags[node.tag] = true;
            });
            tagNames = Object.keys(tags);
        }
        else
            tagNames = [];
        for (const [handle, prefix] of tagEntries) {
            if (handle === '!!' && prefix === 'tag:yaml.org,2002:')
                continue;
            if (!doc || tagNames.some(tn => tn.startsWith(prefix)))
                lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join('\n');
    }
}
Directives.defaultYaml = { explicit: false, version: '1.2' };
Directives.defaultTags = { '!!': 'tag:yaml.org,2002:' };

exports.Directives = Directives;


/***/ }),

/***/ 1464:
/***/ ((__unused_webpack_module, exports) => {



class YAMLError extends Error {
    constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
    }
}
class YAMLParseError extends YAMLError {
    constructor(pos, code, message) {
        super('YAMLParseError', pos, code, message);
    }
}
class YAMLWarning extends YAMLError {
    constructor(pos, code, message) {
        super('YAMLWarning', pos, code, message);
    }
}
const prettifyError = (src, lc) => (error) => {
    if (error.pos[0] === -1)
        return;
    error.linePos = error.pos.map(pos => lc.linePos(pos));
    const { line, col } = error.linePos[0];
    error.message += ` at line ${line}, column ${col}`;
    let ci = col - 1;
    let lineStr = src
        .substring(lc.lineStarts[line - 1], lc.lineStarts[line])
        .replace(/[\n\r]+$/, '');
    // Trim to max 80 chars, keeping col position near the middle
    if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = '…' + lineStr.substring(trimStart);
        ci -= trimStart - 1;
    }
    if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + '…';
    // Include previous line in context if pointing at line start
    if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        // Regexp won't match if start is trimmed
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
            prev = prev.substring(0, 79) + '…\n';
        lineStr = prev + lineStr;
    }
    if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
            count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = ' '.repeat(ci) + '^'.repeat(count);
        error.message += `:\n\n${lineStr}\n${pointer}\n`;
    }
};

exports.YAMLError = YAMLError;
exports.YAMLParseError = YAMLParseError;
exports.YAMLWarning = YAMLWarning;
exports.prettifyError = prettifyError;


/***/ }),

/***/ 8815:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

var __webpack_unused_export__;


var composer = __nccwpck_require__(9984);
var Document = __nccwpck_require__(3021);
var Schema = __nccwpck_require__(5840);
var errors = __nccwpck_require__(1464);
var Alias = __nccwpck_require__(4065);
var identity = __nccwpck_require__(1127);
var Pair = __nccwpck_require__(7165);
var Scalar = __nccwpck_require__(3301);
var YAMLMap = __nccwpck_require__(4454);
var YAMLSeq = __nccwpck_require__(2223);
var cst = __nccwpck_require__(3461);
var lexer = __nccwpck_require__(361);
var lineCounter = __nccwpck_require__(6628);
var parser = __nccwpck_require__(3456);
var publicApi = __nccwpck_require__(4047);
var visit = __nccwpck_require__(204);



__webpack_unused_export__ = composer.Composer;
__webpack_unused_export__ = Document.Document;
__webpack_unused_export__ = Schema.Schema;
__webpack_unused_export__ = errors.YAMLError;
exports.XT = errors.YAMLParseError;
__webpack_unused_export__ = errors.YAMLWarning;
__webpack_unused_export__ = Alias.Alias;
__webpack_unused_export__ = identity.isAlias;
__webpack_unused_export__ = identity.isCollection;
__webpack_unused_export__ = identity.isDocument;
__webpack_unused_export__ = identity.isMap;
__webpack_unused_export__ = identity.isNode;
__webpack_unused_export__ = identity.isPair;
__webpack_unused_export__ = identity.isScalar;
__webpack_unused_export__ = identity.isSeq;
__webpack_unused_export__ = Pair.Pair;
__webpack_unused_export__ = Scalar.Scalar;
__webpack_unused_export__ = YAMLMap.YAMLMap;
__webpack_unused_export__ = YAMLSeq.YAMLSeq;
__webpack_unused_export__ = cst;
__webpack_unused_export__ = lexer.Lexer;
__webpack_unused_export__ = lineCounter.LineCounter;
__webpack_unused_export__ = parser.Parser;
exports.qg = publicApi.parse;
__webpack_unused_export__ = publicApi.parseAllDocuments;
__webpack_unused_export__ = publicApi.parseDocument;
__webpack_unused_export__ = publicApi.stringify;
__webpack_unused_export__ = visit.visit;
__webpack_unused_export__ = visit.visitAsync;


/***/ }),

/***/ 7249:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var node_process = __nccwpck_require__(932);

function debug(logLevel, ...messages) {
    if (logLevel === 'debug')
        console.log(...messages);
}
function warn(logLevel, warning) {
    if (logLevel === 'debug' || logLevel === 'warn') {
        if (typeof node_process.emitWarning === 'function')
            node_process.emitWarning(warning);
        else
            console.warn(warning);
    }
}

exports.debug = debug;
exports.warn = warn;


/***/ }),

/***/ 4065:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var anchors = __nccwpck_require__(1596);
var visit = __nccwpck_require__(204);
var identity = __nccwpck_require__(1127);
var Node = __nccwpck_require__(6673);
var toJS = __nccwpck_require__(4043);

class Alias extends Node.NodeBase {
    constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, 'tag', {
            set() {
                throw new Error('Alias nodes cannot have tags');
            }
        });
    }
    /**
     * Resolve the value of this alias within `doc`, finding the last
     * instance of the `source` anchor before this node.
     */
    resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
            throw new ReferenceError('Alias resolution is disabled');
        let nodes;
        if (ctx?.aliasResolveCache) {
            nodes = ctx.aliasResolveCache;
        }
        else {
            nodes = [];
            visit.visit(doc, {
                Node: (_key, node) => {
                    if (identity.isAlias(node) || identity.hasAnchor(node))
                        nodes.push(node);
                }
            });
            if (ctx)
                ctx.aliasResolveCache = nodes;
        }
        let found = undefined;
        for (const node of nodes) {
            if (node === this)
                break;
            if (node.anchor === this.source)
                found = node;
        }
        return found;
    }
    toJSON(_arg, ctx) {
        if (!ctx)
            return { source: this.source };
        const { anchors, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new ReferenceError(msg);
        }
        let data = anchors.get(source);
        if (!data) {
            // Resolve anchors for Node.prototype.toJS()
            toJS.toJS(source, null, ctx);
            data = anchors.get(source);
        }
        /* istanbul ignore if */
        if (data?.res === undefined) {
            const msg = 'This should not happen: Alias anchor was not resolved?';
            throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
                data.aliasCount = getAliasCount(doc, source, anchors);
            if (data.count * data.aliasCount > maxAliasCount) {
                const msg = 'Excessive alias count indicates a resource exhaustion attack';
                throw new ReferenceError(msg);
            }
        }
        return data.res;
    }
    toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
            anchors.anchorIsValid(this.source);
            if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
                const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
                throw new Error(msg);
            }
            if (ctx.implicitKey)
                return `${src} `;
        }
        return src;
    }
}
function getAliasCount(doc, node, anchors) {
    if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors && source && anchors.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
    }
    else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
            const c = getAliasCount(doc, item, anchors);
            if (c > count)
                count = c;
        }
        return count;
    }
    else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors);
        const vc = getAliasCount(doc, node.value, anchors);
        return Math.max(kc, vc);
    }
    return 1;
}

exports.Alias = Alias;


/***/ }),

/***/ 101:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var createNode = __nccwpck_require__(2404);
var identity = __nccwpck_require__(1127);
var Node = __nccwpck_require__(6673);

function collectionFromPath(schema, path, value) {
    let v = value;
    for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === 'number' && Number.isInteger(k) && k >= 0) {
            const a = [];
            a[k] = v;
            v = a;
        }
        else {
            v = new Map([[k, v]]);
        }
    }
    return createNode.createNode(v, undefined, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
            throw new Error('This should not happen, please report a bug.');
        },
        schema,
        sourceObjects: new Map()
    });
}
// Type guard is intentionally a little wrong so as to be more useful,
// as it does not cover untypable empty non-string iterables (e.g. []).
const isEmptyPath = (path) => path == null ||
    (typeof path === 'object' && !!path[Symbol.iterator]().next().done);
class Collection extends Node.NodeBase {
    constructor(type, schema) {
        super(type);
        Object.defineProperty(this, 'schema', {
            value: schema,
            configurable: true,
            enumerable: false,
            writable: true
        });
    }
    /**
     * Create a copy of this collection.
     *
     * @param schema - If defined, overwrites the original's schema
     */
    clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
            copy.schema = schema;
        copy.items = copy.items.map(it => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
            copy.range = this.range.slice();
        return copy;
    }
    /**
     * Adds a value to the collection. For `!!map` and `!!omap` the value must
     * be a Pair instance or a `{ key, value }` object, which may not have a key
     * that already exists in the map.
     */
    addIn(path, value) {
        if (isEmptyPath(path))
            this.add(value);
        else {
            const [key, ...rest] = path;
            const node = this.get(key, true);
            if (identity.isCollection(node))
                node.addIn(rest, value);
            else if (node === undefined && this.schema)
                this.set(key, collectionFromPath(this.schema, rest, value));
            else
                throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
    }
    /**
     * Removes a value from the collection.
     * @returns `true` if the item was found and removed.
     */
    deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
            return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
            return node.deleteIn(rest);
        else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
    }
    /**
     * Returns item at `key`, or `undefined` if not found. By default unwraps
     * scalar values from their surrounding node; to disable set `keepScalar` to
     * `true` (collections are always returned intact).
     */
    getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
            return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
            return identity.isCollection(node) ? node.getIn(rest, keepScalar) : undefined;
    }
    hasAllNullValues(allowScalar) {
        return this.items.every(node => {
            if (!identity.isPair(node))
                return false;
            const n = node.value;
            return (n == null ||
                (allowScalar &&
                    identity.isScalar(n) &&
                    n.value == null &&
                    !n.commentBefore &&
                    !n.comment &&
                    !n.tag));
        });
    }
    /**
     * Checks if the collection includes a value with the key `key`.
     */
    hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
            return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
    }
    /**
     * Sets a value in this collection. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     */
    setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
            this.set(key, value);
        }
        else {
            const node = this.get(key, true);
            if (identity.isCollection(node))
                node.setIn(rest, value);
            else if (node === undefined && this.schema)
                this.set(key, collectionFromPath(this.schema, rest, value));
            else
                throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
    }
}

exports.Collection = Collection;
exports.collectionFromPath = collectionFromPath;
exports.isEmptyPath = isEmptyPath;


/***/ }),

/***/ 6673:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var applyReviver = __nccwpck_require__(3661);
var identity = __nccwpck_require__(1127);
var toJS = __nccwpck_require__(4043);

class NodeBase {
    constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
    }
    /** Create a copy of this node.  */
    clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
            copy.range = this.range.slice();
        return copy;
    }
    /** A plain JavaScript representation of this node. */
    toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
            throw new TypeError('A document argument is required');
        const ctx = {
            anchors: new Map(),
            doc,
            keep: true,
            mapAsMap: mapAsMap === true,
            mapKeyWarned: false,
            maxAliasCount: typeof maxAliasCount === 'number' ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, '', ctx);
        if (typeof onAnchor === 'function')
            for (const { count, res } of ctx.anchors.values())
                onAnchor(res, count);
        return typeof reviver === 'function'
            ? applyReviver.applyReviver(reviver, { '': res }, '', res)
            : res;
    }
}

exports.NodeBase = NodeBase;


/***/ }),

/***/ 7165:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var createNode = __nccwpck_require__(2404);
var stringifyPair = __nccwpck_require__(9748);
var addPairToJSMap = __nccwpck_require__(7104);
var identity = __nccwpck_require__(1127);

function createPair(key, value, ctx) {
    const k = createNode.createNode(key, undefined, ctx);
    const v = createNode.createNode(value, undefined, ctx);
    return new Pair(k, v);
}
class Pair {
    constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
    }
    clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
            key = key.clone(schema);
        if (identity.isNode(value))
            value = value.clone(schema);
        return new Pair(key, value);
    }
    toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
    }
    toString(ctx, onComment, onChompKeep) {
        return ctx?.doc
            ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep)
            : JSON.stringify(this);
    }
}

exports.Pair = Pair;
exports.createPair = createPair;


/***/ }),

/***/ 3301:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var Node = __nccwpck_require__(6673);
var toJS = __nccwpck_require__(4043);

const isScalarValue = (value) => !value || (typeof value !== 'function' && typeof value !== 'object');
class Scalar extends Node.NodeBase {
    constructor(value) {
        super(identity.SCALAR);
        this.value = value;
    }
    toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
    }
    toString() {
        return String(this.value);
    }
}
Scalar.BLOCK_FOLDED = 'BLOCK_FOLDED';
Scalar.BLOCK_LITERAL = 'BLOCK_LITERAL';
Scalar.PLAIN = 'PLAIN';
Scalar.QUOTE_DOUBLE = 'QUOTE_DOUBLE';
Scalar.QUOTE_SINGLE = 'QUOTE_SINGLE';

exports.Scalar = Scalar;
exports.isScalarValue = isScalarValue;


/***/ }),

/***/ 4454:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyCollection = __nccwpck_require__(1212);
var addPairToJSMap = __nccwpck_require__(7104);
var Collection = __nccwpck_require__(101);
var identity = __nccwpck_require__(1127);
var Pair = __nccwpck_require__(7165);
var Scalar = __nccwpck_require__(3301);

function findPair(items, key) {
    const k = identity.isScalar(key) ? key.value : key;
    for (const it of items) {
        if (identity.isPair(it)) {
            if (it.key === key || it.key === k)
                return it;
            if (identity.isScalar(it.key) && it.key.value === k)
                return it;
        }
    }
    return undefined;
}
class YAMLMap extends Collection.Collection {
    static get tagName() {
        return 'tag:yaml.org,2002:map';
    }
    constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
    }
    /**
     * A generic collection parsing method that can be extended
     * to other node classes that inherit from YAMLMap
     */
    static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
            if (typeof replacer === 'function')
                value = replacer.call(obj, key, value);
            else if (Array.isArray(replacer) && !replacer.includes(key))
                return;
            if (value !== undefined || keepUndefined)
                map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
            for (const [key, value] of obj)
                add(key, value);
        }
        else if (obj && typeof obj === 'object') {
            for (const key of Object.keys(obj))
                add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === 'function') {
            map.items.sort(schema.sortMapEntries);
        }
        return map;
    }
    /**
     * Adds a value to the collection.
     *
     * @param overwrite - If not set `true`, using a key that is already in the
     *   collection will throw. Otherwise, overwrites the previous value.
     */
    add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
            _pair = pair;
        else if (!pair || typeof pair !== 'object' || !('key' in pair)) {
            // In TypeScript, this never happens.
            _pair = new Pair.Pair(pair, pair?.value);
        }
        else
            _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
            if (!overwrite)
                throw new Error(`Key ${_pair.key} already set`);
            // For scalars, keep the old node & its comments and anchors
            if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
                prev.value.value = _pair.value;
            else
                prev.value = _pair.value;
        }
        else if (sortEntries) {
            const i = this.items.findIndex(item => sortEntries(_pair, item) < 0);
            if (i === -1)
                this.items.push(_pair);
            else
                this.items.splice(i, 0, _pair);
        }
        else {
            this.items.push(_pair);
        }
    }
    delete(key) {
        const it = findPair(this.items, key);
        if (!it)
            return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
    }
    get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? undefined;
    }
    has(key) {
        return !!findPair(this.items, key);
    }
    set(key, value) {
        this.add(new Pair.Pair(key, value), true);
    }
    /**
     * @param ctx - Conversion context, originally set in Document#toJS()
     * @param {Class} Type - If set, forces the returned collection type
     * @returns Instance of Type, Map, or Object
     */
    toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? new Map() : {};
        if (ctx?.onCreate)
            ctx.onCreate(map);
        for (const item of this.items)
            addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
    }
    toString(ctx, onComment, onChompKeep) {
        if (!ctx)
            return JSON.stringify(this);
        for (const item of this.items) {
            if (!identity.isPair(item))
                throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
            ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
            blockItemPrefix: '',
            flowChars: { start: '{', end: '}' },
            itemIndent: ctx.indent || '',
            onChompKeep,
            onComment
        });
    }
}

exports.YAMLMap = YAMLMap;
exports.findPair = findPair;


/***/ }),

/***/ 2223:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var createNode = __nccwpck_require__(2404);
var stringifyCollection = __nccwpck_require__(1212);
var Collection = __nccwpck_require__(101);
var identity = __nccwpck_require__(1127);
var Scalar = __nccwpck_require__(3301);
var toJS = __nccwpck_require__(4043);

class YAMLSeq extends Collection.Collection {
    static get tagName() {
        return 'tag:yaml.org,2002:seq';
    }
    constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
    }
    add(value) {
        this.items.push(value);
    }
    /**
     * Removes a value from the collection.
     *
     * `key` must contain a representation of an integer for this to succeed.
     * It may be wrapped in a `Scalar`.
     *
     * @returns `true` if the item was found and removed.
     */
    delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== 'number')
            return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
    }
    get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== 'number')
            return undefined;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
    }
    /**
     * Checks if the collection includes a value with the key `key`.
     *
     * `key` must contain a representation of an integer for this to succeed.
     * It may be wrapped in a `Scalar`.
     */
    has(key) {
        const idx = asItemIndex(key);
        return typeof idx === 'number' && idx < this.items.length;
    }
    /**
     * Sets a value in this collection. For `!!set`, `value` needs to be a
     * boolean to add/remove the item from the set.
     *
     * If `key` does not contain a representation of an integer, this will throw.
     * It may be wrapped in a `Scalar`.
     */
    set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== 'number')
            throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
            prev.value = value;
        else
            this.items[idx] = value;
    }
    toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
            ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
            seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
    }
    toString(ctx, onComment, onChompKeep) {
        if (!ctx)
            return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
            blockItemPrefix: '- ',
            flowChars: { start: '[', end: ']' },
            itemIndent: (ctx.indent || '') + '  ',
            onChompKeep,
            onComment
        });
    }
    static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
            let i = 0;
            for (let it of obj) {
                if (typeof replacer === 'function') {
                    const key = obj instanceof Set ? it : String(i++);
                    it = replacer.call(obj, key, it);
                }
                seq.items.push(createNode.createNode(it, undefined, ctx));
            }
        }
        return seq;
    }
}
function asItemIndex(key) {
    let idx = identity.isScalar(key) ? key.value : key;
    if (idx && typeof idx === 'string')
        idx = Number(idx);
    return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0
        ? idx
        : null;
}

exports.YAMLSeq = YAMLSeq;


/***/ }),

/***/ 7104:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var log = __nccwpck_require__(7249);
var merge = __nccwpck_require__(452);
var stringify = __nccwpck_require__(2148);
var identity = __nccwpck_require__(1127);
var toJS = __nccwpck_require__(4043);

function addPairToJSMap(ctx, map, { key, value }) {
    if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
    // TODO: Should drop this special case for bare << handling
    else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
    else {
        const jsKey = toJS.toJS(key, '', ctx);
        if (map instanceof Map) {
            map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        }
        else if (map instanceof Set) {
            map.add(jsKey);
        }
        else {
            const stringKey = stringifyKey(key, jsKey, ctx);
            const jsValue = toJS.toJS(value, stringKey, ctx);
            if (stringKey in map)
                Object.defineProperty(map, stringKey, {
                    value: jsValue,
                    writable: true,
                    enumerable: true,
                    configurable: true
                });
            else
                map[stringKey] = jsValue;
        }
    }
    return map;
}
function stringifyKey(key, jsKey, ctx) {
    if (jsKey === null)
        return '';
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    if (typeof jsKey !== 'object')
        return String(jsKey);
    if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = new Set();
        for (const node of ctx.anchors.keys())
            strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
            let jsonStr = JSON.stringify(strKey);
            if (jsonStr.length > 40)
                jsonStr = jsonStr.substring(0, 36) + '..."';
            log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
            ctx.mapKeyWarned = true;
        }
        return strKey;
    }
    return JSON.stringify(jsKey);
}

exports.addPairToJSMap = addPairToJSMap;


/***/ }),

/***/ 1127:
/***/ ((__unused_webpack_module, exports) => {



const ALIAS = Symbol.for('yaml.alias');
const DOC = Symbol.for('yaml.document');
const MAP = Symbol.for('yaml.map');
const PAIR = Symbol.for('yaml.pair');
const SCALAR = Symbol.for('yaml.scalar');
const SEQ = Symbol.for('yaml.seq');
const NODE_TYPE = Symbol.for('yaml.node.type');
const isAlias = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === ALIAS;
const isDocument = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === DOC;
const isMap = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === MAP;
const isPair = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === PAIR;
const isScalar = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === SCALAR;
const isSeq = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === SEQ;
function isCollection(node) {
    if (node && typeof node === 'object')
        switch (node[NODE_TYPE]) {
            case MAP:
            case SEQ:
                return true;
        }
    return false;
}
function isNode(node) {
    if (node && typeof node === 'object')
        switch (node[NODE_TYPE]) {
            case ALIAS:
            case MAP:
            case SCALAR:
            case SEQ:
                return true;
        }
    return false;
}
const hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;

exports.ALIAS = ALIAS;
exports.DOC = DOC;
exports.MAP = MAP;
exports.NODE_TYPE = NODE_TYPE;
exports.PAIR = PAIR;
exports.SCALAR = SCALAR;
exports.SEQ = SEQ;
exports.hasAnchor = hasAnchor;
exports.isAlias = isAlias;
exports.isCollection = isCollection;
exports.isDocument = isDocument;
exports.isMap = isMap;
exports.isNode = isNode;
exports.isPair = isPair;
exports.isScalar = isScalar;
exports.isSeq = isSeq;


/***/ }),

/***/ 4043:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);

/**
 * Recursively convert any node or its contents to native JavaScript
 *
 * @param value - The input value
 * @param arg - If `value` defines a `toJSON()` method, use this
 *   as its first argument
 * @param ctx - Conversion context, originally set in Document#toJS(). If
 *   `{ keep: true }` is not set, output should be suitable for JSON
 *   stringification.
 */
function toJS(value, arg, ctx) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
    if (value && typeof value.toJSON === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        if (!ctx || !identity.hasAnchor(value))
            return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: undefined };
        ctx.anchors.set(value, data);
        ctx.onCreate = res => {
            data.res = res;
            delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
            ctx.onCreate(res);
        return res;
    }
    if (typeof value === 'bigint' && !ctx?.keep)
        return Number(value);
    return value;
}

exports.toJS = toJS;


/***/ }),

/***/ 110:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var resolveBlockScalar = __nccwpck_require__(8913);
var resolveFlowScalar = __nccwpck_require__(6842);
var errors = __nccwpck_require__(1464);
var stringifyString = __nccwpck_require__(3069);

function resolveAsScalar(token, strict = true, onError) {
    if (token) {
        const _onError = (pos, code, message) => {
            const offset = typeof pos === 'number' ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
            if (onError)
                onError(offset, code, message);
            else
                throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
            case 'scalar':
            case 'single-quoted-scalar':
            case 'double-quoted-scalar':
                return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
            case 'block-scalar':
                return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
    }
    return null;
}
/**
 * Create a new scalar token with `value`
 *
 * Values that represent an actual string but may be parsed as a different type should use a `type` other than `'PLAIN'`,
 * as this function does not support any schema operations and won't check for such conflicts.
 *
 * @param value The string representation of the value, which will have its content properly indented.
 * @param context.end Comments and whitespace after the end of the value, or after the block scalar header. If undefined, a newline will be added.
 * @param context.implicitKey Being within an implicit key may affect the resolved type of the token's value.
 * @param context.indent The indent level of the token.
 * @param context.inFlow Is this scalar within a flow collection? This may affect the resolved type of the token's value.
 * @param context.offset The offset position of the token.
 * @param context.type The preferred type of the scalar token. If undefined, the previous type of the `token` will be used, defaulting to `'PLAIN'`.
 */
function createScalarToken(value, context) {
    const { implicitKey = false, indent, inFlow = false, offset = -1, type = 'PLAIN' } = context;
    const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? ' '.repeat(indent) : '',
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
    });
    const end = context.end ?? [
        { type: 'newline', offset: -1, indent, source: '\n' }
    ];
    switch (source[0]) {
        case '|':
        case '>': {
            const he = source.indexOf('\n');
            const head = source.substring(0, he);
            const body = source.substring(he + 1) + '\n';
            const props = [
                { type: 'block-scalar-header', offset, indent, source: head }
            ];
            if (!addEndtoBlockProps(props, end))
                props.push({ type: 'newline', offset: -1, indent, source: '\n' });
            return { type: 'block-scalar', offset, indent, props, source: body };
        }
        case '"':
            return { type: 'double-quoted-scalar', offset, indent, source, end };
        case "'":
            return { type: 'single-quoted-scalar', offset, indent, source, end };
        default:
            return { type: 'scalar', offset, indent, source, end };
    }
}
/**
 * Set the value of `token` to the given string `value`, overwriting any previous contents and type that it may have.
 *
 * Best efforts are made to retain any comments previously associated with the `token`,
 * though all contents within a collection's `items` will be overwritten.
 *
 * Values that represent an actual string but may be parsed as a different type should use a `type` other than `'PLAIN'`,
 * as this function does not support any schema operations and won't check for such conflicts.
 *
 * @param token Any token. If it does not include an `indent` value, the value will be stringified as if it were an implicit key.
 * @param value The string representation of the value, which will have its content properly indented.
 * @param context.afterKey In most cases, values after a key should have an additional level of indentation.
 * @param context.implicitKey Being within an implicit key may affect the resolved type of the token's value.
 * @param context.inFlow Being within a flow collection may affect the resolved type of the token's value.
 * @param context.type The preferred type of the scalar token. If undefined, the previous type of the `token` will be used, defaulting to `'PLAIN'`.
 */
function setScalarValue(token, value, context = {}) {
    let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
    let indent = 'indent' in token ? token.indent : null;
    if (afterKey && typeof indent === 'number')
        indent += 2;
    if (!type)
        switch (token.type) {
            case 'single-quoted-scalar':
                type = 'QUOTE_SINGLE';
                break;
            case 'double-quoted-scalar':
                type = 'QUOTE_DOUBLE';
                break;
            case 'block-scalar': {
                const header = token.props[0];
                if (header.type !== 'block-scalar-header')
                    throw new Error('Invalid block scalar header');
                type = header.source[0] === '>' ? 'BLOCK_FOLDED' : 'BLOCK_LITERAL';
                break;
            }
            default:
                type = 'PLAIN';
        }
    const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? ' '.repeat(indent) : '',
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
    });
    switch (source[0]) {
        case '|':
        case '>':
            setBlockScalarValue(token, source);
            break;
        case '"':
            setFlowScalarValue(token, source, 'double-quoted-scalar');
            break;
        case "'":
            setFlowScalarValue(token, source, 'single-quoted-scalar');
            break;
        default:
            setFlowScalarValue(token, source, 'scalar');
    }
}
function setBlockScalarValue(token, source) {
    const he = source.indexOf('\n');
    const head = source.substring(0, he);
    const body = source.substring(he + 1) + '\n';
    if (token.type === 'block-scalar') {
        const header = token.props[0];
        if (header.type !== 'block-scalar-header')
            throw new Error('Invalid block scalar header');
        header.source = head;
        token.source = body;
    }
    else {
        const { offset } = token;
        const indent = 'indent' in token ? token.indent : -1;
        const props = [
            { type: 'block-scalar-header', offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, 'end' in token ? token.end : undefined))
            props.push({ type: 'newline', offset: -1, indent, source: '\n' });
        for (const key of Object.keys(token))
            if (key !== 'type' && key !== 'offset')
                delete token[key];
        Object.assign(token, { type: 'block-scalar', indent, props, source: body });
    }
}
/** @returns `true` if last token is a newline */
function addEndtoBlockProps(props, end) {
    if (end)
        for (const st of end)
            switch (st.type) {
                case 'space':
                case 'comment':
                    props.push(st);
                    break;
                case 'newline':
                    props.push(st);
                    return true;
            }
    return false;
}
function setFlowScalarValue(token, source, type) {
    switch (token.type) {
        case 'scalar':
        case 'double-quoted-scalar':
        case 'single-quoted-scalar':
            token.type = type;
            token.source = source;
            break;
        case 'block-scalar': {
            const end = token.props.slice(1);
            let oa = source.length;
            if (token.props[0].type === 'block-scalar-header')
                oa -= token.props[0].source.length;
            for (const tok of end)
                tok.offset += oa;
            delete token.props;
            Object.assign(token, { type, source, end });
            break;
        }
        case 'block-map':
        case 'block-seq': {
            const offset = token.offset + source.length;
            const nl = { type: 'newline', offset, indent: token.indent, source: '\n' };
            delete token.items;
            Object.assign(token, { type, source, end: [nl] });
            break;
        }
        default: {
            const indent = 'indent' in token ? token.indent : -1;
            const end = 'end' in token && Array.isArray(token.end)
                ? token.end.filter(st => st.type === 'space' ||
                    st.type === 'comment' ||
                    st.type === 'newline')
                : [];
            for (const key of Object.keys(token))
                if (key !== 'type' && key !== 'offset')
                    delete token[key];
            Object.assign(token, { type, indent, source, end });
        }
    }
}

exports.createScalarToken = createScalarToken;
exports.resolveAsScalar = resolveAsScalar;
exports.setScalarValue = setScalarValue;


/***/ }),

/***/ 1733:
/***/ ((__unused_webpack_module, exports) => {



/**
 * Stringify a CST document, token, or collection item
 *
 * Fair warning: This applies no validation whatsoever, and
 * simply concatenates the sources in their logical order.
 */
const stringify = (cst) => 'type' in cst ? stringifyToken(cst) : stringifyItem(cst);
function stringifyToken(token) {
    switch (token.type) {
        case 'block-scalar': {
            let res = '';
            for (const tok of token.props)
                res += stringifyToken(tok);
            return res + token.source;
        }
        case 'block-map':
        case 'block-seq': {
            let res = '';
            for (const item of token.items)
                res += stringifyItem(item);
            return res;
        }
        case 'flow-collection': {
            let res = token.start.source;
            for (const item of token.items)
                res += stringifyItem(item);
            for (const st of token.end)
                res += st.source;
            return res;
        }
        case 'document': {
            let res = stringifyItem(token);
            if (token.end)
                for (const st of token.end)
                    res += st.source;
            return res;
        }
        default: {
            let res = token.source;
            if ('end' in token && token.end)
                for (const st of token.end)
                    res += st.source;
            return res;
        }
    }
}
function stringifyItem({ start, key, sep, value }) {
    let res = '';
    for (const st of start)
        res += st.source;
    if (key)
        res += stringifyToken(key);
    if (sep)
        for (const st of sep)
            res += st.source;
    if (value)
        res += stringifyToken(value);
    return res;
}

exports.stringify = stringify;


/***/ }),

/***/ 7715:
/***/ ((__unused_webpack_module, exports) => {



const BREAK = Symbol('break visit');
const SKIP = Symbol('skip children');
const REMOVE = Symbol('remove item');
/**
 * Apply a visitor to a CST document or item.
 *
 * Walks through the tree (depth-first) starting from the root, calling a
 * `visitor` function with two arguments when entering each item:
 *   - `item`: The current item, which included the following members:
 *     - `start: SourceToken[]` – Source tokens before the key or value,
 *       possibly including its anchor or tag.
 *     - `key?: Token | null` – Set for pair values. May then be `null`, if
 *       the key before the `:` separator is empty.
 *     - `sep?: SourceToken[]` – Source tokens between the key and the value,
 *       which should include the `:` map value indicator if `value` is set.
 *     - `value?: Token` – The value of a sequence item, or of a map pair.
 *   - `path`: The steps from the root to the current node, as an array of
 *     `['key' | 'value', number]` tuples.
 *
 * The return value of the visitor may be used to control the traversal:
 *   - `undefined` (default): Do nothing and continue
 *   - `visit.SKIP`: Do not visit the children of this token, continue with
 *      next sibling
 *   - `visit.BREAK`: Terminate traversal completely
 *   - `visit.REMOVE`: Remove the current item, then continue with the next one
 *   - `number`: Set the index of the next step. This is useful especially if
 *     the index of the current token has changed.
 *   - `function`: Define the next visitor for this item. After the original
 *     visitor is called on item entry, next visitors are called after handling
 *     a non-empty `key` and when exiting the item.
 */
function visit(cst, visitor) {
    if ('type' in cst && cst.type === 'document')
        cst = { start: cst.start, value: cst.value };
    _visit(Object.freeze([]), cst, visitor);
}
// Without the `as symbol` casts, TS declares these in the `visit`
// namespace using `var`, but then complains about that because
// `unique symbol` must be `const`.
/** Terminate visit traversal completely */
visit.BREAK = BREAK;
/** Do not visit the children of the current item */
visit.SKIP = SKIP;
/** Remove the current item */
visit.REMOVE = REMOVE;
/** Find the item at `path` from `cst` as the root */
visit.itemAtPath = (cst, path) => {
    let item = cst;
    for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && 'items' in tok) {
            item = tok.items[index];
        }
        else
            return undefined;
    }
    return item;
};
/**
 * Get the immediate parent collection of the item at `path` from `cst` as the root.
 *
 * Throws an error if the collection is not found, which should never happen if the item itself exists.
 */
visit.parentCollection = (cst, path) => {
    const parent = visit.itemAtPath(cst, path.slice(0, -1));
    const field = path[path.length - 1][0];
    const coll = parent?.[field];
    if (coll && 'items' in coll)
        return coll;
    throw new Error('Parent collection not found');
};
function _visit(path, item, visitor) {
    let ctrl = visitor(item, path);
    if (typeof ctrl === 'symbol')
        return ctrl;
    for (const field of ['key', 'value']) {
        const token = item[field];
        if (token && 'items' in token) {
            for (let i = 0; i < token.items.length; ++i) {
                const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
                if (typeof ci === 'number')
                    i = ci - 1;
                else if (ci === BREAK)
                    return BREAK;
                else if (ci === REMOVE) {
                    token.items.splice(i, 1);
                    i -= 1;
                }
            }
            if (typeof ctrl === 'function' && field === 'key')
                ctrl = ctrl(item, path);
        }
    }
    return typeof ctrl === 'function' ? ctrl(item, path) : ctrl;
}

exports.visit = visit;


/***/ }),

/***/ 3461:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var cstScalar = __nccwpck_require__(110);
var cstStringify = __nccwpck_require__(1733);
var cstVisit = __nccwpck_require__(7715);

/** The byte order mark */
const BOM = '\u{FEFF}';
/** Start of doc-mode */
const DOCUMENT = '\x02'; // C0: Start of Text
/** Unexpected end of flow-mode */
const FLOW_END = '\x18'; // C0: Cancel
/** Next token is a scalar value */
const SCALAR = '\x1f'; // C0: Unit Separator
/** @returns `true` if `token` is a flow or block collection */
const isCollection = (token) => !!token && 'items' in token;
/** @returns `true` if `token` is a flow or block scalar; not an alias */
const isScalar = (token) => !!token &&
    (token.type === 'scalar' ||
        token.type === 'single-quoted-scalar' ||
        token.type === 'double-quoted-scalar' ||
        token.type === 'block-scalar');
/* istanbul ignore next */
/** Get a printable representation of a lexer token */
function prettyToken(token) {
    switch (token) {
        case BOM:
            return '<BOM>';
        case DOCUMENT:
            return '<DOC>';
        case FLOW_END:
            return '<FLOW_END>';
        case SCALAR:
            return '<SCALAR>';
        default:
            return JSON.stringify(token);
    }
}
/** Identify the type of a lexer token. May return `null` for unknown tokens. */
function tokenType(source) {
    switch (source) {
        case BOM:
            return 'byte-order-mark';
        case DOCUMENT:
            return 'doc-mode';
        case FLOW_END:
            return 'flow-error-end';
        case SCALAR:
            return 'scalar';
        case '---':
            return 'doc-start';
        case '...':
            return 'doc-end';
        case '':
        case '\n':
        case '\r\n':
            return 'newline';
        case '-':
            return 'seq-item-ind';
        case '?':
            return 'explicit-key-ind';
        case ':':
            return 'map-value-ind';
        case '{':
            return 'flow-map-start';
        case '}':
            return 'flow-map-end';
        case '[':
            return 'flow-seq-start';
        case ']':
            return 'flow-seq-end';
        case ',':
            return 'comma';
    }
    switch (source[0]) {
        case ' ':
        case '\t':
            return 'space';
        case '#':
            return 'comment';
        case '%':
            return 'directive-line';
        case '*':
            return 'alias';
        case '&':
            return 'anchor';
        case '!':
            return 'tag';
        case "'":
            return 'single-quoted-scalar';
        case '"':
            return 'double-quoted-scalar';
        case '|':
        case '>':
            return 'block-scalar-header';
    }
    return null;
}

exports.createScalarToken = cstScalar.createScalarToken;
exports.resolveAsScalar = cstScalar.resolveAsScalar;
exports.setScalarValue = cstScalar.setScalarValue;
exports.stringify = cstStringify.stringify;
exports.visit = cstVisit.visit;
exports.BOM = BOM;
exports.DOCUMENT = DOCUMENT;
exports.FLOW_END = FLOW_END;
exports.SCALAR = SCALAR;
exports.isCollection = isCollection;
exports.isScalar = isScalar;
exports.prettyToken = prettyToken;
exports.tokenType = tokenType;


/***/ }),

/***/ 361:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var cst = __nccwpck_require__(3461);

/*
START -> stream

stream
  directive -> line-end -> stream
  indent + line-end -> stream
  [else] -> line-start

line-end
  comment -> line-end
  newline -> .
  input-end -> END

line-start
  doc-start -> doc
  doc-end -> stream
  [else] -> indent -> block-start

block-start
  seq-item-start -> block-start
  explicit-key-start -> block-start
  map-value-start -> block-start
  [else] -> doc

doc
  line-end -> line-start
  spaces -> doc
  anchor -> doc
  tag -> doc
  flow-start -> flow -> doc
  flow-end -> error -> doc
  seq-item-start -> error -> doc
  explicit-key-start -> error -> doc
  map-value-start -> doc
  alias -> doc
  quote-start -> quoted-scalar -> doc
  block-scalar-header -> line-end -> block-scalar(min) -> line-start
  [else] -> plain-scalar(false, min) -> doc

flow
  line-end -> flow
  spaces -> flow
  anchor -> flow
  tag -> flow
  flow-start -> flow -> flow
  flow-end -> .
  seq-item-start -> error -> flow
  explicit-key-start -> flow
  map-value-start -> flow
  alias -> flow
  quote-start -> quoted-scalar -> flow
  comma -> flow
  [else] -> plain-scalar(true, 0) -> flow

quoted-scalar
  quote-end -> .
  [else] -> quoted-scalar

block-scalar(min)
  newline + peek(indent < min) -> .
  [else] -> block-scalar(min)

plain-scalar(is-flow, min)
  scalar-end(is-flow) -> .
  peek(newline + (indent < min)) -> .
  [else] -> plain-scalar(min)
*/
function isEmpty(ch) {
    switch (ch) {
        case undefined:
        case ' ':
        case '\n':
        case '\r':
        case '\t':
            return true;
        default:
            return false;
    }
}
const hexDigits = new Set('0123456789ABCDEFabcdef');
const tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
const flowIndicatorChars = new Set(',[]{}');
const invalidAnchorChars = new Set(' ,[]{}\n\r\t');
const isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
/**
 * Splits an input string into lexical tokens, i.e. smaller strings that are
 * easily identifiable by `tokens.tokenType()`.
 *
 * Lexing starts always in a "stream" context. Incomplete input may be buffered
 * until a complete token can be emitted.
 *
 * In addition to slices of the original input, the following control characters
 * may also be emitted:
 *
 * - `\x02` (Start of Text): A document starts with the next token
 * - `\x18` (Cancel): Unexpected end of flow-mode (indicates an error)
 * - `\x1f` (Unit Separator): Next token is a scalar value
 * - `\u{FEFF}` (Byte order mark): Emitted separately outside documents
 */
class Lexer {
    constructor() {
        /**
         * Flag indicating whether the end of the current buffer marks the end of
         * all input
         */
        this.atEnd = false;
        /**
         * Explicit indent set in block scalar header, as an offset from the current
         * minimum indent, so e.g. set to 1 from a header `|2+`. Set to -1 if not
         * explicitly set.
         */
        this.blockScalarIndent = -1;
        /**
         * Block scalars that include a + (keep) chomping indicator in their header
         * include trailing empty lines, which are otherwise excluded from the
         * scalar's contents.
         */
        this.blockScalarKeep = false;
        /** Current input */
        this.buffer = '';
        /**
         * Flag noting whether the map value indicator : can immediately follow this
         * node within a flow context.
         */
        this.flowKey = false;
        /** Count of surrounding flow collection levels. */
        this.flowLevel = 0;
        /**
         * Minimum level of indentation required for next lines to be parsed as a
         * part of the current scalar value.
         */
        this.indentNext = 0;
        /** Indentation level of the current line. */
        this.indentValue = 0;
        /** Position of the next \n character. */
        this.lineEndPos = null;
        /** Stores the state of the lexer if reaching the end of incpomplete input */
        this.next = null;
        /** A pointer to `buffer`; the current position of the lexer. */
        this.pos = 0;
    }
    /**
     * Generate YAML tokens from the `source` string. If `incomplete`,
     * a part of the last line may be left as a buffer for the next call.
     *
     * @returns A generator of lexical tokens
     */
    *lex(source, incomplete = false) {
        if (source) {
            if (typeof source !== 'string')
                throw TypeError('source is not a string');
            this.buffer = this.buffer ? this.buffer + source : source;
            this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? 'stream';
        while (next && (incomplete || this.hasChars(1)))
            next = yield* this.parseNext(next);
    }
    atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === ' ' || ch === '\t')
            ch = this.buffer[++i];
        if (!ch || ch === '#' || ch === '\n')
            return true;
        if (ch === '\r')
            return this.buffer[i + 1] === '\n';
        return false;
    }
    charAt(n) {
        return this.buffer[this.pos + n];
    }
    continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
            let indent = 0;
            while (ch === ' ')
                ch = this.buffer[++indent + offset];
            if (ch === '\r') {
                const next = this.buffer[indent + offset + 1];
                if (next === '\n' || (!next && !this.atEnd))
                    return offset + indent + 1;
            }
            return ch === '\n' || indent >= this.indentNext || (!ch && !this.atEnd)
                ? offset + indent
                : -1;
        }
        if (ch === '-' || ch === '.') {
            const dt = this.buffer.substr(offset, 3);
            if ((dt === '---' || dt === '...') && isEmpty(this.buffer[offset + 3]))
                return -1;
        }
        return offset;
    }
    getLine() {
        let end = this.lineEndPos;
        if (typeof end !== 'number' || (end !== -1 && end < this.pos)) {
            end = this.buffer.indexOf('\n', this.pos);
            this.lineEndPos = end;
        }
        if (end === -1)
            return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === '\r')
            end -= 1;
        return this.buffer.substring(this.pos, end);
    }
    hasChars(n) {
        return this.pos + n <= this.buffer.length;
    }
    setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
    }
    peek(n) {
        return this.buffer.substr(this.pos, n);
    }
    *parseNext(next) {
        switch (next) {
            case 'stream':
                return yield* this.parseStream();
            case 'line-start':
                return yield* this.parseLineStart();
            case 'block-start':
                return yield* this.parseBlockStart();
            case 'doc':
                return yield* this.parseDocument();
            case 'flow':
                return yield* this.parseFlowCollection();
            case 'quoted-scalar':
                return yield* this.parseQuotedScalar();
            case 'block-scalar':
                return yield* this.parseBlockScalar();
            case 'plain-scalar':
                return yield* this.parsePlainScalar();
        }
    }
    *parseStream() {
        let line = this.getLine();
        if (line === null)
            return this.setNext('stream');
        if (line[0] === cst.BOM) {
            yield* this.pushCount(1);
            line = line.substring(1);
        }
        if (line[0] === '%') {
            let dirEnd = line.length;
            let cs = line.indexOf('#');
            while (cs !== -1) {
                const ch = line[cs - 1];
                if (ch === ' ' || ch === '\t') {
                    dirEnd = cs - 1;
                    break;
                }
                else {
                    cs = line.indexOf('#', cs + 1);
                }
            }
            while (true) {
                const ch = line[dirEnd - 1];
                if (ch === ' ' || ch === '\t')
                    dirEnd -= 1;
                else
                    break;
            }
            const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
            yield* this.pushCount(line.length - n); // possible comment
            this.pushNewline();
            return 'stream';
        }
        if (this.atLineEnd()) {
            const sp = yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - sp);
            yield* this.pushNewline();
            return 'stream';
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
    }
    *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
            return this.setNext('line-start');
        if (ch === '-' || ch === '.') {
            if (!this.atEnd && !this.hasChars(4))
                return this.setNext('line-start');
            const s = this.peek(3);
            if ((s === '---' || s === '...') && isEmpty(this.charAt(3))) {
                yield* this.pushCount(3);
                this.indentValue = 0;
                this.indentNext = 0;
                return s === '---' ? 'doc' : 'stream';
            }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
            this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
    }
    *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
            return this.setNext('block-start');
        if ((ch0 === '-' || ch0 === '?' || ch0 === ':') && isEmpty(ch1)) {
            const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
            this.indentNext = this.indentValue + 1;
            this.indentValue += n;
            return 'block-start';
        }
        return 'doc';
    }
    *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
            return this.setNext('doc');
        let n = yield* this.pushIndicators();
        switch (line[n]) {
            case '#':
                yield* this.pushCount(line.length - n);
            // fallthrough
            case undefined:
                yield* this.pushNewline();
                return yield* this.parseLineStart();
            case '{':
            case '[':
                yield* this.pushCount(1);
                this.flowKey = false;
                this.flowLevel = 1;
                return 'flow';
            case '}':
            case ']':
                // this is an error
                yield* this.pushCount(1);
                return 'doc';
            case '*':
                yield* this.pushUntil(isNotAnchorChar);
                return 'doc';
            case '"':
            case "'":
                return yield* this.parseQuotedScalar();
            case '|':
            case '>':
                n += yield* this.parseBlockScalarHeader();
                n += yield* this.pushSpaces(true);
                yield* this.pushCount(line.length - n);
                yield* this.pushNewline();
                return yield* this.parseBlockScalar();
            default:
                return yield* this.parsePlainScalar();
        }
    }
    *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
            nl = yield* this.pushNewline();
            if (nl > 0) {
                sp = yield* this.pushSpaces(false);
                this.indentValue = indent = sp;
            }
            else {
                sp = 0;
            }
            sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
            return this.setNext('flow');
        if ((indent !== -1 && indent < this.indentNext && line[0] !== '#') ||
            (indent === 0 &&
                (line.startsWith('---') || line.startsWith('...')) &&
                isEmpty(line[3]))) {
            // Allowing for the terminal ] or } at the same (rather than greater)
            // indent level as the initial [ or { is technically invalid, but
            // failing here would be surprising to users.
            const atFlowEndMarker = indent === this.indentNext - 1 &&
                this.flowLevel === 1 &&
                (line[0] === ']' || line[0] === '}');
            if (!atFlowEndMarker) {
                // this is an error
                this.flowLevel = 0;
                yield cst.FLOW_END;
                return yield* this.parseLineStart();
            }
        }
        let n = 0;
        while (line[n] === ',') {
            n += yield* this.pushCount(1);
            n += yield* this.pushSpaces(true);
            this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
            case undefined:
                return 'flow';
            case '#':
                yield* this.pushCount(line.length - n);
                return 'flow';
            case '{':
            case '[':
                yield* this.pushCount(1);
                this.flowKey = false;
                this.flowLevel += 1;
                return 'flow';
            case '}':
            case ']':
                yield* this.pushCount(1);
                this.flowKey = true;
                this.flowLevel -= 1;
                return this.flowLevel ? 'flow' : 'doc';
            case '*':
                yield* this.pushUntil(isNotAnchorChar);
                return 'flow';
            case '"':
            case "'":
                this.flowKey = true;
                return yield* this.parseQuotedScalar();
            case ':': {
                const next = this.charAt(1);
                if (this.flowKey || isEmpty(next) || next === ',') {
                    this.flowKey = false;
                    yield* this.pushCount(1);
                    yield* this.pushSpaces(true);
                    return 'flow';
                }
            }
            // fallthrough
            default:
                this.flowKey = false;
                return yield* this.parsePlainScalar();
        }
    }
    *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
            while (end !== -1 && this.buffer[end + 1] === "'")
                end = this.buffer.indexOf("'", end + 2);
        }
        else {
            // double-quote
            while (end !== -1) {
                let n = 0;
                while (this.buffer[end - 1 - n] === '\\')
                    n += 1;
                if (n % 2 === 0)
                    break;
                end = this.buffer.indexOf('"', end + 1);
            }
        }
        // Only looking for newlines within the quotes
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf('\n', this.pos);
        if (nl !== -1) {
            while (nl !== -1) {
                const cs = this.continueScalar(nl + 1);
                if (cs === -1)
                    break;
                nl = qb.indexOf('\n', cs);
            }
            if (nl !== -1) {
                // this is an error caused by an unexpected unindent
                end = nl - (qb[nl - 1] === '\r' ? 2 : 1);
            }
        }
        if (end === -1) {
            if (!this.atEnd)
                return this.setNext('quoted-scalar');
            end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? 'flow' : 'doc';
    }
    *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
            const ch = this.buffer[++i];
            if (ch === '+')
                this.blockScalarKeep = true;
            else if (ch > '0' && ch <= '9')
                this.blockScalarIndent = Number(ch) - 1;
            else if (ch !== '-')
                break;
        }
        return yield* this.pushUntil(ch => isEmpty(ch) || ch === '#');
    }
    *parseBlockScalar() {
        let nl = this.pos - 1; // may be -1 if this.pos === 0
        let indent = 0;
        let ch;
        loop: for (let i = this.pos; (ch = this.buffer[i]); ++i) {
            switch (ch) {
                case ' ':
                    indent += 1;
                    break;
                case '\n':
                    nl = i;
                    indent = 0;
                    break;
                case '\r': {
                    const next = this.buffer[i + 1];
                    if (!next && !this.atEnd)
                        return this.setNext('block-scalar');
                    if (next === '\n')
                        break;
                } // fallthrough
                default:
                    break loop;
            }
        }
        if (!ch && !this.atEnd)
            return this.setNext('block-scalar');
        if (indent >= this.indentNext) {
            if (this.blockScalarIndent === -1)
                this.indentNext = indent;
            else {
                this.indentNext =
                    this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
            }
            do {
                const cs = this.continueScalar(nl + 1);
                if (cs === -1)
                    break;
                nl = this.buffer.indexOf('\n', cs);
            } while (nl !== -1);
            if (nl === -1) {
                if (!this.atEnd)
                    return this.setNext('block-scalar');
                nl = this.buffer.length;
            }
        }
        // Trailing insufficiently indented tabs are invalid.
        // To catch that during parsing, we include them in the block scalar value.
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === ' ')
            ch = this.buffer[++i];
        if (ch === '\t') {
            while (ch === '\t' || ch === ' ' || ch === '\r' || ch === '\n')
                ch = this.buffer[++i];
            nl = i - 1;
        }
        else if (!this.blockScalarKeep) {
            do {
                let i = nl - 1;
                let ch = this.buffer[i];
                if (ch === '\r')
                    ch = this.buffer[--i];
                const lastChar = i; // Drop the line if last char not more indented
                while (ch === ' ')
                    ch = this.buffer[--i];
                if (ch === '\n' && i >= this.pos && i + 1 + indent > lastChar)
                    nl = i;
                else
                    break;
            } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
    }
    *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while ((ch = this.buffer[++i])) {
            if (ch === ':') {
                const next = this.buffer[i + 1];
                if (isEmpty(next) || (inFlow && flowIndicatorChars.has(next)))
                    break;
                end = i;
            }
            else if (isEmpty(ch)) {
                let next = this.buffer[i + 1];
                if (ch === '\r') {
                    if (next === '\n') {
                        i += 1;
                        ch = '\n';
                        next = this.buffer[i + 1];
                    }
                    else
                        end = i;
                }
                if (next === '#' || (inFlow && flowIndicatorChars.has(next)))
                    break;
                if (ch === '\n') {
                    const cs = this.continueScalar(i + 1);
                    if (cs === -1)
                        break;
                    i = Math.max(i, cs - 2); // to advance, but still account for ' #'
                }
            }
            else {
                if (inFlow && flowIndicatorChars.has(ch))
                    break;
                end = i;
            }
        }
        if (!ch && !this.atEnd)
            return this.setNext('plain-scalar');
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? 'flow' : 'doc';
    }
    *pushCount(n) {
        if (n > 0) {
            yield this.buffer.substr(this.pos, n);
            this.pos += n;
            return n;
        }
        return 0;
    }
    *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
            yield s;
            this.pos += s.length;
            return s.length;
        }
        else if (allowEmpty)
            yield '';
        return 0;
    }
    *pushIndicators() {
        let n = 0;
        loop: while (true) {
            switch (this.charAt(0)) {
                case '!':
                    n += yield* this.pushTag();
                    n += yield* this.pushSpaces(true);
                    continue loop;
                case '&':
                    n += yield* this.pushUntil(isNotAnchorChar);
                    n += yield* this.pushSpaces(true);
                    continue loop;
                case '-': // this is an error
                case '?': // this is an error outside flow collections
                case ':': {
                    const inFlow = this.flowLevel > 0;
                    const ch1 = this.charAt(1);
                    if (isEmpty(ch1) || (inFlow && flowIndicatorChars.has(ch1))) {
                        if (!inFlow)
                            this.indentNext = this.indentValue + 1;
                        else if (this.flowKey)
                            this.flowKey = false;
                        n += yield* this.pushCount(1);
                        n += yield* this.pushSpaces(true);
                        continue loop;
                    }
                }
            }
            break loop;
        }
        return n;
    }
    *pushTag() {
        if (this.charAt(1) === '<') {
            let i = this.pos + 2;
            let ch = this.buffer[i];
            while (!isEmpty(ch) && ch !== '>')
                ch = this.buffer[++i];
            return yield* this.pushToIndex(ch === '>' ? i + 1 : i, false);
        }
        else {
            let i = this.pos + 1;
            let ch = this.buffer[i];
            while (ch) {
                if (tagChars.has(ch))
                    ch = this.buffer[++i];
                else if (ch === '%' &&
                    hexDigits.has(this.buffer[i + 1]) &&
                    hexDigits.has(this.buffer[i + 2])) {
                    ch = this.buffer[(i += 3)];
                }
                else
                    break;
            }
            return yield* this.pushToIndex(i, false);
        }
    }
    *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === '\n')
            return yield* this.pushCount(1);
        else if (ch === '\r' && this.charAt(1) === '\n')
            return yield* this.pushCount(2);
        else
            return 0;
    }
    *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
            ch = this.buffer[++i];
        } while (ch === ' ' || (allowTabs && ch === '\t'));
        const n = i - this.pos;
        if (n > 0) {
            yield this.buffer.substr(this.pos, n);
            this.pos = i;
        }
        return n;
    }
    *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
            ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
    }
}

exports.Lexer = Lexer;


/***/ }),

/***/ 6628:
/***/ ((__unused_webpack_module, exports) => {



/**
 * Tracks newlines during parsing in order to provide an efficient API for
 * determining the one-indexed `{ line, col }` position for any offset
 * within the input.
 */
class LineCounter {
    constructor() {
        this.lineStarts = [];
        /**
         * Should be called in ascending order. Otherwise, call
         * `lineCounter.lineStarts.sort()` before calling `linePos()`.
         */
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        /**
         * Performs a binary search and returns the 1-indexed { line, col }
         * position of `offset`. If `line === 0`, `addNewLine` has never been
         * called or `offset` is before the first known newline.
         */
        this.linePos = (offset) => {
            let low = 0;
            let high = this.lineStarts.length;
            while (low < high) {
                const mid = (low + high) >> 1; // Math.floor((low + high) / 2)
                if (this.lineStarts[mid] < offset)
                    low = mid + 1;
                else
                    high = mid;
            }
            if (this.lineStarts[low] === offset)
                return { line: low + 1, col: 1 };
            if (low === 0)
                return { line: 0, col: offset };
            const start = this.lineStarts[low - 1];
            return { line: low, col: offset - start + 1 };
        };
    }
}

exports.LineCounter = LineCounter;


/***/ }),

/***/ 3456:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var node_process = __nccwpck_require__(932);
var cst = __nccwpck_require__(3461);
var lexer = __nccwpck_require__(361);

function includesToken(list, type) {
    for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
            return true;
    return false;
}
function findNonEmptyIndex(list) {
    for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
            case 'space':
            case 'comment':
            case 'newline':
                break;
            default:
                return i;
        }
    }
    return -1;
}
function isFlowToken(token) {
    switch (token?.type) {
        case 'alias':
        case 'scalar':
        case 'single-quoted-scalar':
        case 'double-quoted-scalar':
        case 'flow-collection':
            return true;
        default:
            return false;
    }
}
function getPrevProps(parent) {
    switch (parent.type) {
        case 'document':
            return parent.start;
        case 'block-map': {
            const it = parent.items[parent.items.length - 1];
            return it.sep ?? it.start;
        }
        case 'block-seq':
            return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
            return [];
    }
}
/** Note: May modify input array */
function getFirstKeyStartProps(prev) {
    if (prev.length === 0)
        return [];
    let i = prev.length;
    loop: while (--i >= 0) {
        switch (prev[i].type) {
            case 'doc-start':
            case 'explicit-key-ind':
            case 'map-value-ind':
            case 'seq-item-ind':
            case 'newline':
                break loop;
        }
    }
    while (prev[++i]?.type === 'space') {
        /* loop */
    }
    return prev.splice(i, prev.length);
}
function arrayPushArray(target, source) {
    // May exhaust call stack with large `source` array
    if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
    else
        for (let i = 0; i < source.length; ++i)
            target.push(source[i]);
}
function fixFlowSeqItems(fc) {
    if (fc.start.type === 'flow-seq-start') {
        for (const it of fc.items) {
            if (it.sep &&
                !it.value &&
                !includesToken(it.start, 'explicit-key-ind') &&
                !includesToken(it.sep, 'map-value-ind')) {
                if (it.key)
                    it.value = it.key;
                delete it.key;
                if (isFlowToken(it.value)) {
                    if (it.value.end)
                        arrayPushArray(it.value.end, it.sep);
                    else
                        it.value.end = it.sep;
                }
                else
                    arrayPushArray(it.start, it.sep);
                delete it.sep;
            }
        }
    }
}
/**
 * A YAML concrete syntax tree (CST) parser
 *
 * ```ts
 * const src: string = ...
 * for (const token of new Parser().parse(src)) {
 *   // token: Token
 * }
 * ```
 *
 * To use the parser with a user-provided lexer:
 *
 * ```ts
 * function* parse(source: string, lexer: Lexer) {
 *   const parser = new Parser()
 *   for (const lexeme of lexer.lex(source))
 *     yield* parser.next(lexeme)
 *   yield* parser.end()
 * }
 *
 * const src: string = ...
 * const lexer = new Lexer()
 * for (const token of parse(src, lexer)) {
 *   // token: Token
 * }
 * ```
 */
class Parser {
    /**
     * @param onNewLine - If defined, called separately with the start position of
     *   each new line (in `parse()`, including the start of input).
     */
    constructor(onNewLine) {
        /** If true, space and sequence indicators count as indentation */
        this.atNewLine = true;
        /** If true, next token is a scalar value */
        this.atScalar = false;
        /** Current indentation level */
        this.indent = 0;
        /** Current offset since the start of parsing */
        this.offset = 0;
        /** On the same line with a block map key */
        this.onKeyLine = false;
        /** Top indicates the node that's currently being built */
        this.stack = [];
        /** The source of the current token, set in parse() */
        this.source = '';
        /** The type of the current token, set in parse() */
        this.type = '';
        // Must be defined after `next()`
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
    }
    /**
     * Parse `source` as a YAML stream.
     * If `incomplete`, a part of the last line may be left as a buffer for the next call.
     *
     * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
     *
     * @returns A generator of tokens representing each directive, document, and other structure.
     */
    *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
            this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
            yield* this.next(lexeme);
        if (!incomplete)
            yield* this.end();
    }
    /**
     * Advance the parser by the `source` of one lexical token.
     */
    *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
            console.log('|', cst.prettyToken(source));
        if (this.atScalar) {
            this.atScalar = false;
            yield* this.step();
            this.offset += source.length;
            return;
        }
        const type = cst.tokenType(source);
        if (!type) {
            const message = `Not a YAML token: ${source}`;
            yield* this.pop({ type: 'error', offset: this.offset, message, source });
            this.offset += source.length;
        }
        else if (type === 'scalar') {
            this.atNewLine = false;
            this.atScalar = true;
            this.type = 'scalar';
        }
        else {
            this.type = type;
            yield* this.step();
            switch (type) {
                case 'newline':
                    this.atNewLine = true;
                    this.indent = 0;
                    if (this.onNewLine)
                        this.onNewLine(this.offset + source.length);
                    break;
                case 'space':
                    if (this.atNewLine && source[0] === ' ')
                        this.indent += source.length;
                    break;
                case 'explicit-key-ind':
                case 'map-value-ind':
                case 'seq-item-ind':
                    if (this.atNewLine)
                        this.indent += source.length;
                    break;
                case 'doc-mode':
                case 'flow-error-end':
                    return;
                default:
                    this.atNewLine = false;
            }
            this.offset += source.length;
        }
    }
    /** Call at end of input to push out any remaining constructions */
    *end() {
        while (this.stack.length > 0)
            yield* this.pop();
    }
    get sourceToken() {
        const st = {
            type: this.type,
            offset: this.offset,
            indent: this.indent,
            source: this.source
        };
        return st;
    }
    *step() {
        const top = this.peek(1);
        if (this.type === 'doc-end' && top?.type !== 'doc-end') {
            while (this.stack.length > 0)
                yield* this.pop();
            this.stack.push({
                type: 'doc-end',
                offset: this.offset,
                source: this.source
            });
            return;
        }
        if (!top)
            return yield* this.stream();
        switch (top.type) {
            case 'document':
                return yield* this.document(top);
            case 'alias':
            case 'scalar':
            case 'single-quoted-scalar':
            case 'double-quoted-scalar':
                return yield* this.scalar(top);
            case 'block-scalar':
                return yield* this.blockScalar(top);
            case 'block-map':
                return yield* this.blockMap(top);
            case 'block-seq':
                return yield* this.blockSequence(top);
            case 'flow-collection':
                return yield* this.flowCollection(top);
            case 'doc-end':
                return yield* this.documentEnd(top);
        }
        /* istanbul ignore next should not happen */
        yield* this.pop();
    }
    peek(n) {
        return this.stack[this.stack.length - n];
    }
    *pop(error) {
        const token = error ?? this.stack.pop();
        /* istanbul ignore if should not happen */
        if (!token) {
            const message = 'Tried to pop an empty stack';
            yield { type: 'error', offset: this.offset, source: '', message };
        }
        else if (this.stack.length === 0) {
            yield token;
        }
        else {
            const top = this.peek(1);
            if (token.type === 'block-scalar') {
                // Block scalars use their parent rather than header indent
                token.indent = 'indent' in top ? top.indent : 0;
            }
            else if (token.type === 'flow-collection' && top.type === 'document') {
                // Ignore all indent for top-level flow collections
                token.indent = 0;
            }
            if (token.type === 'flow-collection')
                fixFlowSeqItems(token);
            switch (top.type) {
                case 'document':
                    top.value = token;
                    break;
                case 'block-scalar':
                    top.props.push(token); // error
                    break;
                case 'block-map': {
                    const it = top.items[top.items.length - 1];
                    if (it.value) {
                        top.items.push({ start: [], key: token, sep: [] });
                        this.onKeyLine = true;
                        return;
                    }
                    else if (it.sep) {
                        it.value = token;
                    }
                    else {
                        Object.assign(it, { key: token, sep: [] });
                        this.onKeyLine = !it.explicitKey;
                        return;
                    }
                    break;
                }
                case 'block-seq': {
                    const it = top.items[top.items.length - 1];
                    if (it.value)
                        top.items.push({ start: [], value: token });
                    else
                        it.value = token;
                    break;
                }
                case 'flow-collection': {
                    const it = top.items[top.items.length - 1];
                    if (!it || it.value)
                        top.items.push({ start: [], key: token, sep: [] });
                    else if (it.sep)
                        it.value = token;
                    else
                        Object.assign(it, { key: token, sep: [] });
                    return;
                }
                /* istanbul ignore next should not happen */
                default:
                    yield* this.pop();
                    yield* this.pop(token);
            }
            if ((top.type === 'document' ||
                top.type === 'block-map' ||
                top.type === 'block-seq') &&
                (token.type === 'block-map' || token.type === 'block-seq')) {
                const last = token.items[token.items.length - 1];
                if (last &&
                    !last.sep &&
                    !last.value &&
                    last.start.length > 0 &&
                    findNonEmptyIndex(last.start) === -1 &&
                    (token.indent === 0 ||
                        last.start.every(st => st.type !== 'comment' || st.indent < token.indent))) {
                    if (top.type === 'document')
                        top.end = last.start;
                    else
                        top.items.push({ start: last.start });
                    token.items.splice(-1, 1);
                }
            }
        }
    }
    *stream() {
        switch (this.type) {
            case 'directive-line':
                yield { type: 'directive', offset: this.offset, source: this.source };
                return;
            case 'byte-order-mark':
            case 'space':
            case 'comment':
            case 'newline':
                yield this.sourceToken;
                return;
            case 'doc-mode':
            case 'doc-start': {
                const doc = {
                    type: 'document',
                    offset: this.offset,
                    start: []
                };
                if (this.type === 'doc-start')
                    doc.start.push(this.sourceToken);
                this.stack.push(doc);
                return;
            }
        }
        yield {
            type: 'error',
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML stream`,
            source: this.source
        };
    }
    *document(doc) {
        if (doc.value)
            return yield* this.lineEnd(doc);
        switch (this.type) {
            case 'doc-start': {
                if (findNonEmptyIndex(doc.start) !== -1) {
                    yield* this.pop();
                    yield* this.step();
                }
                else
                    doc.start.push(this.sourceToken);
                return;
            }
            case 'anchor':
            case 'tag':
            case 'space':
            case 'comment':
            case 'newline':
                doc.start.push(this.sourceToken);
                return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
            this.stack.push(bv);
        else {
            yield {
                type: 'error',
                offset: this.offset,
                message: `Unexpected ${this.type} token in YAML document`,
                source: this.source
            };
        }
    }
    *scalar(scalar) {
        if (this.type === 'map-value-ind') {
            const prev = getPrevProps(this.peek(2));
            const start = getFirstKeyStartProps(prev);
            let sep;
            if (scalar.end) {
                sep = scalar.end;
                sep.push(this.sourceToken);
                delete scalar.end;
            }
            else
                sep = [this.sourceToken];
            const map = {
                type: 'block-map',
                offset: scalar.offset,
                indent: scalar.indent,
                items: [{ start, key: scalar, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
        }
        else
            yield* this.lineEnd(scalar);
    }
    *blockScalar(scalar) {
        switch (this.type) {
            case 'space':
            case 'comment':
            case 'newline':
                scalar.props.push(this.sourceToken);
                return;
            case 'scalar':
                scalar.source = this.source;
                // block-scalar source includes trailing newline
                this.atNewLine = true;
                this.indent = 0;
                if (this.onNewLine) {
                    let nl = this.source.indexOf('\n') + 1;
                    while (nl !== 0) {
                        this.onNewLine(this.offset + nl);
                        nl = this.source.indexOf('\n', nl) + 1;
                    }
                }
                yield* this.pop();
                break;
            /* istanbul ignore next should not happen */
            default:
                yield* this.pop();
                yield* this.step();
        }
    }
    *blockMap(map) {
        const it = map.items[map.items.length - 1];
        // it.sep is true-ish if pair already has key or : separator
        switch (this.type) {
            case 'newline':
                this.onKeyLine = false;
                if (it.value) {
                    const end = 'end' in it.value ? it.value.end : undefined;
                    const last = Array.isArray(end) ? end[end.length - 1] : undefined;
                    if (last?.type === 'comment')
                        end?.push(this.sourceToken);
                    else
                        map.items.push({ start: [this.sourceToken] });
                }
                else if (it.sep) {
                    it.sep.push(this.sourceToken);
                }
                else {
                    it.start.push(this.sourceToken);
                }
                return;
            case 'space':
            case 'comment':
                if (it.value) {
                    map.items.push({ start: [this.sourceToken] });
                }
                else if (it.sep) {
                    it.sep.push(this.sourceToken);
                }
                else {
                    if (this.atIndentedComment(it.start, map.indent)) {
                        const prev = map.items[map.items.length - 2];
                        const end = prev?.value?.end;
                        if (Array.isArray(end)) {
                            arrayPushArray(end, it.start);
                            end.push(this.sourceToken);
                            map.items.pop();
                            return;
                        }
                    }
                    it.start.push(this.sourceToken);
                }
                return;
        }
        if (this.indent >= map.indent) {
            const atMapIndent = !this.onKeyLine && this.indent === map.indent;
            const atNextItem = atMapIndent &&
                (it.sep || it.explicitKey) &&
                this.type !== 'seq-item-ind';
            // For empty nodes, assign newline-separated not indented empty tokens to following node
            let start = [];
            if (atNextItem && it.sep && !it.value) {
                const nl = [];
                for (let i = 0; i < it.sep.length; ++i) {
                    const st = it.sep[i];
                    switch (st.type) {
                        case 'newline':
                            nl.push(i);
                            break;
                        case 'space':
                            break;
                        case 'comment':
                            if (st.indent > map.indent)
                                nl.length = 0;
                            break;
                        default:
                            nl.length = 0;
                    }
                }
                if (nl.length >= 2)
                    start = it.sep.splice(nl[1]);
            }
            switch (this.type) {
                case 'anchor':
                case 'tag':
                    if (atNextItem || it.value) {
                        start.push(this.sourceToken);
                        map.items.push({ start });
                        this.onKeyLine = true;
                    }
                    else if (it.sep) {
                        it.sep.push(this.sourceToken);
                    }
                    else {
                        it.start.push(this.sourceToken);
                    }
                    return;
                case 'explicit-key-ind':
                    if (!it.sep && !it.explicitKey) {
                        it.start.push(this.sourceToken);
                        it.explicitKey = true;
                    }
                    else if (atNextItem || it.value) {
                        start.push(this.sourceToken);
                        map.items.push({ start, explicitKey: true });
                    }
                    else {
                        this.stack.push({
                            type: 'block-map',
                            offset: this.offset,
                            indent: this.indent,
                            items: [{ start: [this.sourceToken], explicitKey: true }]
                        });
                    }
                    this.onKeyLine = true;
                    return;
                case 'map-value-ind':
                    if (it.explicitKey) {
                        if (!it.sep) {
                            if (includesToken(it.start, 'newline')) {
                                Object.assign(it, { key: null, sep: [this.sourceToken] });
                            }
                            else {
                                const start = getFirstKeyStartProps(it.start);
                                this.stack.push({
                                    type: 'block-map',
                                    offset: this.offset,
                                    indent: this.indent,
                                    items: [{ start, key: null, sep: [this.sourceToken] }]
                                });
                            }
                        }
                        else if (it.value) {
                            map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                        }
                        else if (includesToken(it.sep, 'map-value-ind')) {
                            this.stack.push({
                                type: 'block-map',
                                offset: this.offset,
                                indent: this.indent,
                                items: [{ start, key: null, sep: [this.sourceToken] }]
                            });
                        }
                        else if (isFlowToken(it.key) &&
                            !includesToken(it.sep, 'newline')) {
                            const start = getFirstKeyStartProps(it.start);
                            const key = it.key;
                            const sep = it.sep;
                            sep.push(this.sourceToken);
                            // @ts-expect-error type guard is wrong here
                            delete it.key;
                            // @ts-expect-error type guard is wrong here
                            delete it.sep;
                            this.stack.push({
                                type: 'block-map',
                                offset: this.offset,
                                indent: this.indent,
                                items: [{ start, key, sep }]
                            });
                        }
                        else if (start.length > 0) {
                            // Not actually at next item
                            it.sep = it.sep.concat(start, this.sourceToken);
                        }
                        else {
                            it.sep.push(this.sourceToken);
                        }
                    }
                    else {
                        if (!it.sep) {
                            Object.assign(it, { key: null, sep: [this.sourceToken] });
                        }
                        else if (it.value || atNextItem) {
                            map.items.push({ start, key: null, sep: [this.sourceToken] });
                        }
                        else if (includesToken(it.sep, 'map-value-ind')) {
                            this.stack.push({
                                type: 'block-map',
                                offset: this.offset,
                                indent: this.indent,
                                items: [{ start: [], key: null, sep: [this.sourceToken] }]
                            });
                        }
                        else {
                            it.sep.push(this.sourceToken);
                        }
                    }
                    this.onKeyLine = true;
                    return;
                case 'alias':
                case 'scalar':
                case 'single-quoted-scalar':
                case 'double-quoted-scalar': {
                    const fs = this.flowScalar(this.type);
                    if (atNextItem || it.value) {
                        map.items.push({ start, key: fs, sep: [] });
                        this.onKeyLine = true;
                    }
                    else if (it.sep) {
                        this.stack.push(fs);
                    }
                    else {
                        Object.assign(it, { key: fs, sep: [] });
                        this.onKeyLine = true;
                    }
                    return;
                }
                default: {
                    const bv = this.startBlockValue(map);
                    if (bv) {
                        if (bv.type === 'block-seq') {
                            if (!it.explicitKey &&
                                it.sep &&
                                !includesToken(it.sep, 'newline')) {
                                yield* this.pop({
                                    type: 'error',
                                    offset: this.offset,
                                    message: 'Unexpected block-seq-ind on same line with key',
                                    source: this.source
                                });
                                return;
                            }
                        }
                        else if (atMapIndent) {
                            map.items.push({ start });
                        }
                        this.stack.push(bv);
                        return;
                    }
                }
            }
        }
        yield* this.pop();
        yield* this.step();
    }
    *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
            case 'newline':
                if (it.value) {
                    const end = 'end' in it.value ? it.value.end : undefined;
                    const last = Array.isArray(end) ? end[end.length - 1] : undefined;
                    if (last?.type === 'comment')
                        end?.push(this.sourceToken);
                    else
                        seq.items.push({ start: [this.sourceToken] });
                }
                else
                    it.start.push(this.sourceToken);
                return;
            case 'space':
            case 'comment':
                if (it.value)
                    seq.items.push({ start: [this.sourceToken] });
                else {
                    if (this.atIndentedComment(it.start, seq.indent)) {
                        const prev = seq.items[seq.items.length - 2];
                        const end = prev?.value?.end;
                        if (Array.isArray(end)) {
                            arrayPushArray(end, it.start);
                            end.push(this.sourceToken);
                            seq.items.pop();
                            return;
                        }
                    }
                    it.start.push(this.sourceToken);
                }
                return;
            case 'anchor':
            case 'tag':
                if (it.value || this.indent <= seq.indent)
                    break;
                it.start.push(this.sourceToken);
                return;
            case 'seq-item-ind':
                if (this.indent !== seq.indent)
                    break;
                if (it.value || includesToken(it.start, 'seq-item-ind'))
                    seq.items.push({ start: [this.sourceToken] });
                else
                    it.start.push(this.sourceToken);
                return;
        }
        if (this.indent > seq.indent) {
            const bv = this.startBlockValue(seq);
            if (bv) {
                this.stack.push(bv);
                return;
            }
        }
        yield* this.pop();
        yield* this.step();
    }
    *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === 'flow-error-end') {
            let top;
            do {
                yield* this.pop();
                top = this.peek(1);
            } while (top?.type === 'flow-collection');
        }
        else if (fc.end.length === 0) {
            switch (this.type) {
                case 'comma':
                case 'explicit-key-ind':
                    if (!it || it.sep)
                        fc.items.push({ start: [this.sourceToken] });
                    else
                        it.start.push(this.sourceToken);
                    return;
                case 'map-value-ind':
                    if (!it || it.value)
                        fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
                    else if (it.sep)
                        it.sep.push(this.sourceToken);
                    else
                        Object.assign(it, { key: null, sep: [this.sourceToken] });
                    return;
                case 'space':
                case 'comment':
                case 'newline':
                case 'anchor':
                case 'tag':
                    if (!it || it.value)
                        fc.items.push({ start: [this.sourceToken] });
                    else if (it.sep)
                        it.sep.push(this.sourceToken);
                    else
                        it.start.push(this.sourceToken);
                    return;
                case 'alias':
                case 'scalar':
                case 'single-quoted-scalar':
                case 'double-quoted-scalar': {
                    const fs = this.flowScalar(this.type);
                    if (!it || it.value)
                        fc.items.push({ start: [], key: fs, sep: [] });
                    else if (it.sep)
                        this.stack.push(fs);
                    else
                        Object.assign(it, { key: fs, sep: [] });
                    return;
                }
                case 'flow-map-end':
                case 'flow-seq-end':
                    fc.end.push(this.sourceToken);
                    return;
            }
            const bv = this.startBlockValue(fc);
            /* istanbul ignore else should not happen */
            if (bv)
                this.stack.push(bv);
            else {
                yield* this.pop();
                yield* this.step();
            }
        }
        else {
            const parent = this.peek(2);
            if (parent.type === 'block-map' &&
                ((this.type === 'map-value-ind' && parent.indent === fc.indent) ||
                    (this.type === 'newline' &&
                        !parent.items[parent.items.length - 1].sep))) {
                yield* this.pop();
                yield* this.step();
            }
            else if (this.type === 'map-value-ind' &&
                parent.type !== 'flow-collection') {
                const prev = getPrevProps(parent);
                const start = getFirstKeyStartProps(prev);
                fixFlowSeqItems(fc);
                const sep = fc.end.splice(1, fc.end.length);
                sep.push(this.sourceToken);
                const map = {
                    type: 'block-map',
                    offset: fc.offset,
                    indent: fc.indent,
                    items: [{ start, key: fc, sep }]
                };
                this.onKeyLine = true;
                this.stack[this.stack.length - 1] = map;
            }
            else {
                yield* this.lineEnd(fc);
            }
        }
    }
    flowScalar(type) {
        if (this.onNewLine) {
            let nl = this.source.indexOf('\n') + 1;
            while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf('\n', nl) + 1;
            }
        }
        return {
            type,
            offset: this.offset,
            indent: this.indent,
            source: this.source
        };
    }
    startBlockValue(parent) {
        switch (this.type) {
            case 'alias':
            case 'scalar':
            case 'single-quoted-scalar':
            case 'double-quoted-scalar':
                return this.flowScalar(this.type);
            case 'block-scalar-header':
                return {
                    type: 'block-scalar',
                    offset: this.offset,
                    indent: this.indent,
                    props: [this.sourceToken],
                    source: ''
                };
            case 'flow-map-start':
            case 'flow-seq-start':
                return {
                    type: 'flow-collection',
                    offset: this.offset,
                    indent: this.indent,
                    start: this.sourceToken,
                    items: [],
                    end: []
                };
            case 'seq-item-ind':
                return {
                    type: 'block-seq',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [this.sourceToken] }]
                };
            case 'explicit-key-ind': {
                this.onKeyLine = true;
                const prev = getPrevProps(parent);
                const start = getFirstKeyStartProps(prev);
                start.push(this.sourceToken);
                return {
                    type: 'block-map',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, explicitKey: true }]
                };
            }
            case 'map-value-ind': {
                this.onKeyLine = true;
                const prev = getPrevProps(parent);
                const start = getFirstKeyStartProps(prev);
                return {
                    type: 'block-map',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                };
            }
        }
        return null;
    }
    atIndentedComment(start, indent) {
        if (this.type !== 'comment')
            return false;
        if (this.indent <= indent)
            return false;
        return start.every(st => st.type === 'newline' || st.type === 'space');
    }
    *documentEnd(docEnd) {
        if (this.type !== 'doc-mode') {
            if (docEnd.end)
                docEnd.end.push(this.sourceToken);
            else
                docEnd.end = [this.sourceToken];
            if (this.type === 'newline')
                yield* this.pop();
        }
    }
    *lineEnd(token) {
        switch (this.type) {
            case 'comma':
            case 'doc-start':
            case 'doc-end':
            case 'flow-seq-end':
            case 'flow-map-end':
            case 'map-value-ind':
                yield* this.pop();
                yield* this.step();
                break;
            case 'newline':
                this.onKeyLine = false;
            // fallthrough
            case 'space':
            case 'comment':
            default:
                // all other values are errors
                if (token.end)
                    token.end.push(this.sourceToken);
                else
                    token.end = [this.sourceToken];
                if (this.type === 'newline')
                    yield* this.pop();
        }
    }
}

exports.Parser = Parser;


/***/ }),

/***/ 4047:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var composer = __nccwpck_require__(9984);
var Document = __nccwpck_require__(3021);
var errors = __nccwpck_require__(1464);
var log = __nccwpck_require__(7249);
var identity = __nccwpck_require__(1127);
var lineCounter = __nccwpck_require__(6628);
var parser = __nccwpck_require__(3456);

function parseOptions(options) {
    const prettyErrors = options.prettyErrors !== false;
    const lineCounter$1 = options.lineCounter || (prettyErrors && new lineCounter.LineCounter()) || null;
    return { lineCounter: lineCounter$1, prettyErrors };
}
/**
 * Parse the input as a stream of YAML documents.
 *
 * Documents should be separated from each other by `...` or `---` marker lines.
 *
 * @returns If an empty `docs` array is returned, it will be of type
 *   EmptyStream and contain additional stream information. In
 *   TypeScript, you should use `'empty' in docs` as a type guard for it.
 */
function parseAllDocuments(source, options = {}) {
    const { lineCounter, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter?.addNewLine);
    const composer$1 = new composer.Composer(options);
    const docs = Array.from(composer$1.compose(parser$1.parse(source)));
    if (prettyErrors && lineCounter)
        for (const doc of docs) {
            doc.errors.forEach(errors.prettifyError(source, lineCounter));
            doc.warnings.forEach(errors.prettifyError(source, lineCounter));
        }
    if (docs.length > 0)
        return docs;
    return Object.assign([], { empty: true }, composer$1.streamInfo());
}
/** Parse an input string into a single YAML.Document */
function parseDocument(source, options = {}) {
    const { lineCounter, prettyErrors } = parseOptions(options);
    const parser$1 = new parser.Parser(lineCounter?.addNewLine);
    const composer$1 = new composer.Composer(options);
    // `doc` is always set by compose.end(true) at the very latest
    let doc = null;
    for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
            doc = _doc;
        else if (doc.options.logLevel !== 'silent') {
            doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), 'MULTIPLE_DOCS', 'Source contains multiple documents; please use YAML.parseAllDocuments()'));
            break;
        }
    }
    if (prettyErrors && lineCounter) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter));
    }
    return doc;
}
function parse(src, reviver, options) {
    let _reviver = undefined;
    if (typeof reviver === 'function') {
        _reviver = reviver;
    }
    else if (options === undefined && reviver && typeof reviver === 'object') {
        options = reviver;
    }
    const doc = parseDocument(src, options);
    if (!doc)
        return null;
    doc.warnings.forEach(warning => log.warn(doc.options.logLevel, warning));
    if (doc.errors.length > 0) {
        if (doc.options.logLevel !== 'silent')
            throw doc.errors[0];
        else
            doc.errors = [];
    }
    return doc.toJS(Object.assign({ reviver: _reviver }, options));
}
function stringify(value, replacer, options) {
    let _replacer = null;
    if (typeof replacer === 'function' || Array.isArray(replacer)) {
        _replacer = replacer;
    }
    else if (options === undefined && replacer) {
        options = replacer;
    }
    if (typeof options === 'string')
        options = options.length;
    if (typeof options === 'number') {
        const indent = Math.round(options);
        options = indent < 1 ? undefined : indent > 8 ? { indent: 8 } : { indent };
    }
    if (value === undefined) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
            return undefined;
    }
    if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
    return new Document.Document(value, _replacer, options).toString(options);
}

exports.parse = parse;
exports.parseAllDocuments = parseAllDocuments;
exports.parseDocument = parseDocument;
exports.stringify = stringify;


/***/ }),

/***/ 5840:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var map = __nccwpck_require__(7451);
var seq = __nccwpck_require__(1706);
var string = __nccwpck_require__(6464);
var tags = __nccwpck_require__(18);

const sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
class Schema {
    constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat)
            ? tags.getTags(compat, 'compat')
            : compat
                ? tags.getTags(null, compat)
                : null;
        this.name = (typeof schema === 'string' && schema) || 'core';
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        // Used by createMap()
        this.sortMapEntries =
            typeof sortMapEntries === 'function'
                ? sortMapEntries
                : sortMapEntries === true
                    ? sortMapEntriesByKey
                    : null;
    }
    clone() {
        const copy = Object.create(Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
    }
}

exports.Schema = Schema;


/***/ }),

/***/ 7451:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var YAMLMap = __nccwpck_require__(4454);

const map = {
    collection: 'map',
    default: true,
    nodeClass: YAMLMap.YAMLMap,
    tag: 'tag:yaml.org,2002:map',
    resolve(map, onError) {
        if (!identity.isMap(map))
            onError('Expected a mapping for this tag');
        return map;
    },
    createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
};

exports.map = map;


/***/ }),

/***/ 3632:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(3301);

const nullTag = {
    identify: value => value == null,
    createNode: () => new Scalar.Scalar(null),
    default: true,
    tag: 'tag:yaml.org,2002:null',
    test: /^(?:~|[Nn]ull|NULL)?$/,
    resolve: () => new Scalar.Scalar(null),
    stringify: ({ source }, ctx) => typeof source === 'string' && nullTag.test.test(source)
        ? source
        : ctx.options.nullStr
};

exports.nullTag = nullTag;


/***/ }),

/***/ 1706:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var YAMLSeq = __nccwpck_require__(2223);

const seq = {
    collection: 'seq',
    default: true,
    nodeClass: YAMLSeq.YAMLSeq,
    tag: 'tag:yaml.org,2002:seq',
    resolve(seq, onError) {
        if (!identity.isSeq(seq))
            onError('Expected a sequence for this tag');
        return seq;
    },
    createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
};

exports.seq = seq;


/***/ }),

/***/ 6464:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyString = __nccwpck_require__(3069);

const string = {
    identify: value => typeof value === 'string',
    default: true,
    tag: 'tag:yaml.org,2002:str',
    resolve: str => str,
    stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
    }
};

exports.string = string;


/***/ }),

/***/ 3959:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(3301);

const boolTag = {
    identify: value => typeof value === 'boolean',
    default: true,
    tag: 'tag:yaml.org,2002:bool',
    test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
    resolve: str => new Scalar.Scalar(str[0] === 't' || str[0] === 'T'),
    stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
            const sv = source[0] === 't' || source[0] === 'T';
            if (value === sv)
                return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
};

exports.boolTag = boolTag;


/***/ }),

/***/ 8405:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(3301);
var stringifyNumber = __nccwpck_require__(8689);

const floatNaN = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: str => str.slice(-3).toLowerCase() === 'nan'
        ? NaN
        : str[0] === '-'
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
};
const floatExp = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    format: 'EXP',
    test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
    resolve: str => parseFloat(str),
    stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
};
const float = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
    resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf('.');
        if (dot !== -1 && str[str.length - 1] === '0')
            node.minFractionDigits = str.length - dot - 1;
        return node;
    },
    stringify: stringifyNumber.stringifyNumber
};

exports.float = float;
exports.floatExp = floatExp;
exports.floatNaN = floatNaN;


/***/ }),

/***/ 9874:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyNumber = __nccwpck_require__(8689);

const intIdentify = (value) => typeof value === 'bigint' || Number.isInteger(value);
const intResolve = (str, offset, radix, { intAsBigInt }) => (intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix));
function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
    return stringifyNumber.stringifyNumber(node);
}
const intOct = {
    identify: value => intIdentify(value) && value >= 0,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'OCT',
    test: /^0o[0-7]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
    stringify: node => intStringify(node, 8, '0o')
};
const int = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    test: /^[-+]?[0-9]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
};
const intHex = {
    identify: value => intIdentify(value) && value >= 0,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'HEX',
    test: /^0x[0-9a-fA-F]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: node => intStringify(node, 16, '0x')
};

exports.int = int;
exports.intHex = intHex;
exports.intOct = intOct;


/***/ }),

/***/ 896:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var map = __nccwpck_require__(7451);
var _null = __nccwpck_require__(3632);
var seq = __nccwpck_require__(1706);
var string = __nccwpck_require__(6464);
var bool = __nccwpck_require__(3959);
var float = __nccwpck_require__(8405);
var int = __nccwpck_require__(9874);

const schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.boolTag,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float
];

exports.schema = schema;


/***/ }),

/***/ 3559:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(3301);
var map = __nccwpck_require__(7451);
var seq = __nccwpck_require__(1706);

function intIdentify(value) {
    return typeof value === 'bigint' || Number.isInteger(value);
}
const stringifyJSON = ({ value }) => JSON.stringify(value);
const jsonScalars = [
    {
        identify: value => typeof value === 'string',
        default: true,
        tag: 'tag:yaml.org,2002:str',
        resolve: str => str,
        stringify: stringifyJSON
    },
    {
        identify: value => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: 'tag:yaml.org,2002:null',
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
    },
    {
        identify: value => typeof value === 'boolean',
        default: true,
        tag: 'tag:yaml.org,2002:bool',
        test: /^true$|^false$/,
        resolve: str => str === 'true',
        stringify: stringifyJSON
    },
    {
        identify: intIdentify,
        default: true,
        tag: 'tag:yaml.org,2002:int',
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
    },
    {
        identify: value => typeof value === 'number',
        default: true,
        tag: 'tag:yaml.org,2002:float',
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: str => parseFloat(str),
        stringify: stringifyJSON
    }
];
const jsonError = {
    default: true,
    tag: '',
    test: /^/,
    resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
    }
};
const schema = [map.map, seq.seq].concat(jsonScalars, jsonError);

exports.schema = schema;


/***/ }),

/***/ 18:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var map = __nccwpck_require__(7451);
var _null = __nccwpck_require__(3632);
var seq = __nccwpck_require__(1706);
var string = __nccwpck_require__(6464);
var bool = __nccwpck_require__(3959);
var float = __nccwpck_require__(8405);
var int = __nccwpck_require__(9874);
var schema = __nccwpck_require__(896);
var schema$1 = __nccwpck_require__(3559);
var binary = __nccwpck_require__(6083);
var merge = __nccwpck_require__(452);
var omap = __nccwpck_require__(303);
var pairs = __nccwpck_require__(8385);
var schema$2 = __nccwpck_require__(5913);
var set = __nccwpck_require__(1528);
var timestamp = __nccwpck_require__(6752);

const schemas = new Map([
    ['core', schema.schema],
    ['failsafe', [map.map, seq.seq, string.string]],
    ['json', schema$1.schema],
    ['yaml11', schema$2.schema],
    ['yaml-1.1', schema$2.schema]
]);
const tagsByName = {
    binary: binary.binary,
    bool: bool.boolTag,
    float: float.float,
    floatExp: float.floatExp,
    floatNaN: float.floatNaN,
    floatTime: timestamp.floatTime,
    int: int.int,
    intHex: int.intHex,
    intOct: int.intOct,
    intTime: timestamp.intTime,
    map: map.map,
    merge: merge.merge,
    null: _null.nullTag,
    omap: omap.omap,
    pairs: pairs.pairs,
    seq: seq.seq,
    set: set.set,
    timestamp: timestamp.timestamp
};
const coreKnownTags = {
    'tag:yaml.org,2002:binary': binary.binary,
    'tag:yaml.org,2002:merge': merge.merge,
    'tag:yaml.org,2002:omap': omap.omap,
    'tag:yaml.org,2002:pairs': pairs.pairs,
    'tag:yaml.org,2002:set': set.set,
    'tag:yaml.org,2002:timestamp': timestamp.timestamp
};
function getTags(customTags, schemaName, addMergeTag) {
    const schemaTags = schemas.get(schemaName);
    if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge)
            ? schemaTags.concat(merge.merge)
            : schemaTags.slice();
    }
    let tags = schemaTags;
    if (!tags) {
        if (Array.isArray(customTags))
            tags = [];
        else {
            const keys = Array.from(schemas.keys())
                .filter(key => key !== 'yaml11')
                .map(key => JSON.stringify(key))
                .join(', ');
            throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
    }
    if (Array.isArray(customTags)) {
        for (const tag of customTags)
            tags = tags.concat(tag);
    }
    else if (typeof customTags === 'function') {
        tags = customTags(tags.slice());
    }
    if (addMergeTag)
        tags = tags.concat(merge.merge);
    return tags.reduce((tags, tag) => {
        const tagObj = typeof tag === 'string' ? tagsByName[tag] : tag;
        if (!tagObj) {
            const tagName = JSON.stringify(tag);
            const keys = Object.keys(tagsByName)
                .map(key => JSON.stringify(key))
                .join(', ');
            throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags.includes(tagObj))
            tags.push(tagObj);
        return tags;
    }, []);
}

exports.coreKnownTags = coreKnownTags;
exports.getTags = getTags;


/***/ }),

/***/ 6083:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var node_buffer = __nccwpck_require__(181);
var Scalar = __nccwpck_require__(3301);
var stringifyString = __nccwpck_require__(3069);

const binary = {
    identify: value => value instanceof Uint8Array, // Buffer inherits from Uint8Array
    default: false,
    tag: 'tag:yaml.org,2002:binary',
    /**
     * Returns a Buffer in node and an Uint8Array in browsers
     *
     * To use the resulting buffer as an image, you'll want to do something like:
     *
     *   const blob = new Blob([buffer], { type: 'image/jpeg' })
     *   document.querySelector('#photo').src = URL.createObjectURL(blob)
     */
    resolve(src, onError) {
        if (typeof node_buffer.Buffer === 'function') {
            return node_buffer.Buffer.from(src, 'base64');
        }
        else if (typeof atob === 'function') {
            // On IE 11, atob() can't handle newlines
            const str = atob(src.replace(/[\n\r]/g, ''));
            const buffer = new Uint8Array(str.length);
            for (let i = 0; i < str.length; ++i)
                buffer[i] = str.charCodeAt(i);
            return buffer;
        }
        else {
            onError('This environment does not support reading binary tags; either Buffer or atob is required');
            return src;
        }
    },
    stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
            return '';
        const buf = value; // checked earlier by binary.identify()
        let str;
        if (typeof node_buffer.Buffer === 'function') {
            str =
                buf instanceof node_buffer.Buffer
                    ? buf.toString('base64')
                    : node_buffer.Buffer.from(buf.buffer).toString('base64');
        }
        else if (typeof btoa === 'function') {
            let s = '';
            for (let i = 0; i < buf.length; ++i)
                s += String.fromCharCode(buf[i]);
            str = btoa(s);
        }
        else {
            throw new Error('This environment does not support writing binary tags; either Buffer or btoa is required');
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
            const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
            const n = Math.ceil(str.length / lineWidth);
            const lines = new Array(n);
            for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
                lines[i] = str.substr(o, lineWidth);
            }
            str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? '\n' : ' ');
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
    }
};

exports.binary = binary;


/***/ }),

/***/ 8398:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(3301);

function boolStringify({ value, source }, ctx) {
    const boolObj = value ? trueTag : falseTag;
    if (source && boolObj.test.test(source))
        return source;
    return value ? ctx.options.trueStr : ctx.options.falseStr;
}
const trueTag = {
    identify: value => value === true,
    default: true,
    tag: 'tag:yaml.org,2002:bool',
    test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
    resolve: () => new Scalar.Scalar(true),
    stringify: boolStringify
};
const falseTag = {
    identify: value => value === false,
    default: true,
    tag: 'tag:yaml.org,2002:bool',
    test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
    resolve: () => new Scalar.Scalar(false),
    stringify: boolStringify
};

exports.falseTag = falseTag;
exports.trueTag = trueTag;


/***/ }),

/***/ 5782:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(3301);
var stringifyNumber = __nccwpck_require__(8689);

const floatNaN = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
    resolve: (str) => str.slice(-3).toLowerCase() === 'nan'
        ? NaN
        : str[0] === '-'
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY,
    stringify: stringifyNumber.stringifyNumber
};
const floatExp = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    format: 'EXP',
    test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
    resolve: (str) => parseFloat(str.replace(/_/g, '')),
    stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
    }
};
const float = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
    resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, '')));
        const dot = str.indexOf('.');
        if (dot !== -1) {
            const f = str.substring(dot + 1).replace(/_/g, '');
            if (f[f.length - 1] === '0')
                node.minFractionDigits = f.length;
        }
        return node;
    },
    stringify: stringifyNumber.stringifyNumber
};

exports.float = float;
exports.floatExp = floatExp;
exports.floatNaN = floatNaN;


/***/ }),

/***/ 873:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyNumber = __nccwpck_require__(8689);

const intIdentify = (value) => typeof value === 'bigint' || Number.isInteger(value);
function intResolve(str, offset, radix, { intAsBigInt }) {
    const sign = str[0];
    if (sign === '-' || sign === '+')
        offset += 1;
    str = str.substring(offset).replace(/_/g, '');
    if (intAsBigInt) {
        switch (radix) {
            case 2:
                str = `0b${str}`;
                break;
            case 8:
                str = `0o${str}`;
                break;
            case 16:
                str = `0x${str}`;
                break;
        }
        const n = BigInt(str);
        return sign === '-' ? BigInt(-1) * n : n;
    }
    const n = parseInt(str, radix);
    return sign === '-' ? -1 * n : n;
}
function intStringify(node, radix, prefix) {
    const { value } = node;
    if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? '-' + prefix + str.substr(1) : prefix + str;
    }
    return stringifyNumber.stringifyNumber(node);
}
const intBin = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'BIN',
    test: /^[-+]?0b[0-1_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
    stringify: node => intStringify(node, 2, '0b')
};
const intOct = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'OCT',
    test: /^[-+]?0[0-7_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
    stringify: node => intStringify(node, 8, '0')
};
const int = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    test: /^[-+]?[0-9][0-9_]*$/,
    resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
    stringify: stringifyNumber.stringifyNumber
};
const intHex = {
    identify: intIdentify,
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'HEX',
    test: /^[-+]?0x[0-9a-fA-F_]+$/,
    resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
    stringify: node => intStringify(node, 16, '0x')
};

exports.int = int;
exports.intBin = intBin;
exports.intHex = intHex;
exports.intOct = intOct;


/***/ }),

/***/ 452:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var Scalar = __nccwpck_require__(3301);

// If the value associated with a merge key is a single mapping node, each of
// its key/value pairs is inserted into the current mapping, unless the key
// already exists in it. If the value associated with the merge key is a
// sequence, then this sequence is expected to contain mapping nodes and each
// of these nodes is merged in turn according to its order in the sequence.
// Keys in mapping nodes earlier in the sequence override keys specified in
// later mapping nodes. -- http://yaml.org/type/merge.html
const MERGE_KEY = '<<';
const merge = {
    identify: value => value === MERGE_KEY ||
        (typeof value === 'symbol' && value.description === MERGE_KEY),
    default: 'key',
    tag: 'tag:yaml.org,2002:merge',
    test: /^<<$/,
    resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
    }),
    stringify: () => MERGE_KEY
};
const isMergeKey = (ctx, key) => (merge.identify(key) ||
    (identity.isScalar(key) &&
        (!key.type || key.type === Scalar.Scalar.PLAIN) &&
        merge.identify(key.value))) &&
    ctx?.doc.schema.tags.some(tag => tag.tag === merge.tag && tag.default);
function addMergeToJSMap(ctx, map, value) {
    const source = resolveAliasValue(ctx, value);
    if (identity.isSeq(source))
        for (const it of source.items)
            mergeValue(ctx, map, it);
    else if (Array.isArray(source))
        for (const it of source)
            mergeValue(ctx, map, it);
    else
        mergeValue(ctx, map, source);
}
function mergeValue(ctx, map, value) {
    const source = resolveAliasValue(ctx, value);
    if (!identity.isMap(source))
        throw new Error('Merge sources must be maps or map aliases');
    const srcMap = source.toJSON(null, ctx, Map);
    for (const [key, value] of srcMap) {
        if (map instanceof Map) {
            if (!map.has(key))
                map.set(key, value);
        }
        else if (map instanceof Set) {
            map.add(key);
        }
        else if (!Object.prototype.hasOwnProperty.call(map, key)) {
            Object.defineProperty(map, key, {
                value,
                writable: true,
                enumerable: true,
                configurable: true
            });
        }
    }
    return map;
}
function resolveAliasValue(ctx, value) {
    return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
}

exports.addMergeToJSMap = addMergeToJSMap;
exports.isMergeKey = isMergeKey;
exports.merge = merge;


/***/ }),

/***/ 303:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var toJS = __nccwpck_require__(4043);
var YAMLMap = __nccwpck_require__(4454);
var YAMLSeq = __nccwpck_require__(2223);
var pairs = __nccwpck_require__(8385);

class YAMLOMap extends YAMLSeq.YAMLSeq {
    constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = YAMLOMap.tag;
    }
    /**
     * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
     * but TypeScript won't allow widening the signature of a child method.
     */
    toJSON(_, ctx) {
        if (!ctx)
            return super.toJSON(_);
        const map = new Map();
        if (ctx?.onCreate)
            ctx.onCreate(map);
        for (const pair of this.items) {
            let key, value;
            if (identity.isPair(pair)) {
                key = toJS.toJS(pair.key, '', ctx);
                value = toJS.toJS(pair.value, key, ctx);
            }
            else {
                key = toJS.toJS(pair, '', ctx);
            }
            if (map.has(key))
                throw new Error('Ordered maps must not include duplicate keys');
            map.set(key, value);
        }
        return map;
    }
    static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap = new this();
        omap.items = pairs$1.items;
        return omap;
    }
}
YAMLOMap.tag = 'tag:yaml.org,2002:omap';
const omap = {
    collection: 'seq',
    identify: value => value instanceof Map,
    nodeClass: YAMLOMap,
    default: false,
    tag: 'tag:yaml.org,2002:omap',
    resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
            if (identity.isScalar(key)) {
                if (seenKeys.includes(key.value)) {
                    onError(`Ordered maps must not include duplicate keys: ${key.value}`);
                }
                else {
                    seenKeys.push(key.value);
                }
            }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
    },
    createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
};

exports.YAMLOMap = YAMLOMap;
exports.omap = omap;


/***/ }),

/***/ 8385:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var Pair = __nccwpck_require__(7165);
var Scalar = __nccwpck_require__(3301);
var YAMLSeq = __nccwpck_require__(2223);

function resolvePairs(seq, onError) {
    if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
            let item = seq.items[i];
            if (identity.isPair(item))
                continue;
            else if (identity.isMap(item)) {
                if (item.items.length > 1)
                    onError('Each pair must have its own sequence indicator');
                const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
                if (item.commentBefore)
                    pair.key.commentBefore = pair.key.commentBefore
                        ? `${item.commentBefore}\n${pair.key.commentBefore}`
                        : item.commentBefore;
                if (item.comment) {
                    const cn = pair.value ?? pair.key;
                    cn.comment = cn.comment
                        ? `${item.comment}\n${cn.comment}`
                        : item.comment;
                }
                item = pair;
            }
            seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
    }
    else
        onError('Expected a sequence for this tag');
    return seq;
}
function createPairs(schema, iterable, ctx) {
    const { replacer } = ctx;
    const pairs = new YAMLSeq.YAMLSeq(schema);
    pairs.tag = 'tag:yaml.org,2002:pairs';
    let i = 0;
    if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
            if (typeof replacer === 'function')
                it = replacer.call(iterable, String(i++), it);
            let key, value;
            if (Array.isArray(it)) {
                if (it.length === 2) {
                    key = it[0];
                    value = it[1];
                }
                else
                    throw new TypeError(`Expected [key, value] tuple: ${it}`);
            }
            else if (it && it instanceof Object) {
                const keys = Object.keys(it);
                if (keys.length === 1) {
                    key = keys[0];
                    value = it[key];
                }
                else {
                    throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
                }
            }
            else {
                key = it;
            }
            pairs.items.push(Pair.createPair(key, value, ctx));
        }
    return pairs;
}
const pairs = {
    collection: 'seq',
    default: false,
    tag: 'tag:yaml.org,2002:pairs',
    resolve: resolvePairs,
    createNode: createPairs
};

exports.createPairs = createPairs;
exports.pairs = pairs;
exports.resolvePairs = resolvePairs;


/***/ }),

/***/ 5913:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var map = __nccwpck_require__(7451);
var _null = __nccwpck_require__(3632);
var seq = __nccwpck_require__(1706);
var string = __nccwpck_require__(6464);
var binary = __nccwpck_require__(6083);
var bool = __nccwpck_require__(8398);
var float = __nccwpck_require__(5782);
var int = __nccwpck_require__(873);
var merge = __nccwpck_require__(452);
var omap = __nccwpck_require__(303);
var pairs = __nccwpck_require__(8385);
var set = __nccwpck_require__(1528);
var timestamp = __nccwpck_require__(6752);

const schema = [
    map.map,
    seq.seq,
    string.string,
    _null.nullTag,
    bool.trueTag,
    bool.falseTag,
    int.intBin,
    int.intOct,
    int.int,
    int.intHex,
    float.floatNaN,
    float.floatExp,
    float.float,
    binary.binary,
    merge.merge,
    omap.omap,
    pairs.pairs,
    set.set,
    timestamp.intTime,
    timestamp.floatTime,
    timestamp.timestamp
];

exports.schema = schema;


/***/ }),

/***/ 1528:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var Pair = __nccwpck_require__(7165);
var YAMLMap = __nccwpck_require__(4454);

class YAMLSet extends YAMLMap.YAMLMap {
    constructor(schema) {
        super(schema);
        this.tag = YAMLSet.tag;
    }
    add(key) {
        let pair;
        if (identity.isPair(key))
            pair = key;
        else if (key &&
            typeof key === 'object' &&
            'key' in key &&
            'value' in key &&
            key.value === null)
            pair = new Pair.Pair(key.key, null);
        else
            pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
            this.items.push(pair);
    }
    /**
     * If `keepPair` is `true`, returns the Pair matching `key`.
     * Otherwise, returns the value of that Pair's key.
     */
    get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair)
            ? identity.isScalar(pair.key)
                ? pair.key.value
                : pair.key
            : pair;
    }
    set(key, value) {
        if (typeof value !== 'boolean')
            throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
            this.items.splice(this.items.indexOf(prev), 1);
        }
        else if (!prev && value) {
            this.items.push(new Pair.Pair(key));
        }
    }
    toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
    }
    toString(ctx, onComment, onChompKeep) {
        if (!ctx)
            return JSON.stringify(this);
        if (this.hasAllNullValues(true))
            return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
            throw new Error('Set items must all have null values');
    }
    static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
            for (let value of iterable) {
                if (typeof replacer === 'function')
                    value = replacer.call(iterable, value, value);
                set.items.push(Pair.createPair(value, null, ctx));
            }
        return set;
    }
}
YAMLSet.tag = 'tag:yaml.org,2002:set';
const set = {
    collection: 'map',
    identify: value => value instanceof Set,
    nodeClass: YAMLSet,
    default: false,
    tag: 'tag:yaml.org,2002:set',
    createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
    resolve(map, onError) {
        if (identity.isMap(map)) {
            if (map.hasAllNullValues(true))
                return Object.assign(new YAMLSet(), map);
            else
                onError('Set items must all have null values');
        }
        else
            onError('Expected a mapping for this tag');
        return map;
    }
};

exports.YAMLSet = YAMLSet;
exports.set = set;


/***/ }),

/***/ 6752:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var stringifyNumber = __nccwpck_require__(8689);

/** Internal types handle bigint as number, because TS can't figure it out. */
function parseSexagesimal(str, asBigInt) {
    const sign = str[0];
    const parts = sign === '-' || sign === '+' ? str.substring(1) : str;
    const num = (n) => asBigInt ? BigInt(n) : Number(n);
    const res = parts
        .replace(/_/g, '')
        .split(':')
        .reduce((res, p) => res * num(60) + num(p), num(0));
    return (sign === '-' ? num(-1) * res : res);
}
/**
 * hhhh:mm:ss.sss
 *
 * Internal types handle bigint as number, because TS can't figure it out.
 */
function stringifySexagesimal(node) {
    let { value } = node;
    let num = (n) => n;
    if (typeof value === 'bigint')
        num = n => BigInt(n);
    else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
    let sign = '';
    if (value < 0) {
        sign = '-';
        value *= num(-1);
    }
    const _60 = num(60);
    const parts = [value % _60]; // seconds, including ms
    if (value < 60) {
        parts.unshift(0); // at least one : is required
    }
    else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60); // minutes
        if (value >= 60) {
            value = (value - parts[0]) / _60;
            parts.unshift(value); // hours
        }
    }
    return (sign +
        parts
            .map(n => String(n).padStart(2, '0'))
            .join(':')
            .replace(/000000\d*$/, '') // % 60 may introduce error
    );
}
const intTime = {
    identify: value => typeof value === 'bigint' || Number.isInteger(value),
    default: true,
    tag: 'tag:yaml.org,2002:int',
    format: 'TIME',
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
    resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
    stringify: stringifySexagesimal
};
const floatTime = {
    identify: value => typeof value === 'number',
    default: true,
    tag: 'tag:yaml.org,2002:float',
    format: 'TIME',
    test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
    resolve: str => parseSexagesimal(str, false),
    stringify: stringifySexagesimal
};
const timestamp = {
    identify: value => value instanceof Date,
    default: true,
    tag: 'tag:yaml.org,2002:timestamp',
    // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
    // may be omitted altogether, resulting in a date format. In such a case, the time part is
    // assumed to be 00:00:00Z (start of day, UTC).
    test: RegExp('^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})' + // YYYY-Mm-Dd
        '(?:' + // time is optional
        '(?:t|T|[ \\t]+)' + // t | T | whitespace
        '([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)' + // Hh:Mm:Ss(.ss)?
        '(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?' + // Z | +5 | -03:30
        ')?$'),
    resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
            throw new Error('!!timestamp expects a date, starting with yyyy-mm-dd');
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + '00').substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== 'Z') {
            let d = parseSexagesimal(tz, false);
            if (Math.abs(d) < 30)
                d *= 60;
            date -= 60000 * d;
        }
        return new Date(date);
    },
    stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, '') ?? ''
};

exports.floatTime = floatTime;
exports.intTime = intTime;
exports.timestamp = timestamp;


/***/ }),

/***/ 4475:
/***/ ((__unused_webpack_module, exports) => {



const FOLD_FLOW = 'flow';
const FOLD_BLOCK = 'block';
const FOLD_QUOTED = 'quoted';
/**
 * Tries to keep input at up to `lineWidth` characters, splitting only on spaces
 * not followed by newlines or spaces unless `mode` is `'quoted'`. Lines are
 * terminated with `\n` and started with `indent`.
 */
function foldFlowLines(text, indent, mode = 'flow', { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
    if (!lineWidth || lineWidth < 0)
        return text;
    if (lineWidth < minContentWidth)
        minContentWidth = 0;
    const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
    if (text.length <= endStep)
        return text;
    const folds = [];
    const escapedFolds = {};
    let end = lineWidth - indent.length;
    if (typeof indentAtStart === 'number') {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
            folds.push(0);
        else
            end = lineWidth - indentAtStart;
    }
    let split = undefined;
    let prev = undefined;
    let overflow = false;
    let i = -1;
    let escStart = -1;
    let escEnd = -1;
    if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
            end = i + endStep;
    }
    for (let ch; (ch = text[(i += 1)]);) {
        if (mode === FOLD_QUOTED && ch === '\\') {
            escStart = i;
            switch (text[i + 1]) {
                case 'x':
                    i += 3;
                    break;
                case 'u':
                    i += 5;
                    break;
                case 'U':
                    i += 9;
                    break;
                default:
                    i += 1;
            }
            escEnd = i;
        }
        if (ch === '\n') {
            if (mode === FOLD_BLOCK)
                i = consumeMoreIndentedLines(text, i, indent.length);
            end = i + indent.length + endStep;
            split = undefined;
        }
        else {
            if (ch === ' ' &&
                prev &&
                prev !== ' ' &&
                prev !== '\n' &&
                prev !== '\t') {
                // space surrounded by non-space can be replaced with newline + indent
                const next = text[i + 1];
                if (next && next !== ' ' && next !== '\n' && next !== '\t')
                    split = i;
            }
            if (i >= end) {
                if (split) {
                    folds.push(split);
                    end = split + endStep;
                    split = undefined;
                }
                else if (mode === FOLD_QUOTED) {
                    // white-space collected at end may stretch past lineWidth
                    while (prev === ' ' || prev === '\t') {
                        prev = ch;
                        ch = text[(i += 1)];
                        overflow = true;
                    }
                    // Account for newline escape, but don't break preceding escape
                    const j = i > escEnd + 1 ? i - 2 : escStart - 1;
                    // Bail out if lineWidth & minContentWidth are shorter than an escape string
                    if (escapedFolds[j])
                        return text;
                    folds.push(j);
                    escapedFolds[j] = true;
                    end = j + endStep;
                    split = undefined;
                }
                else {
                    overflow = true;
                }
            }
        }
        prev = ch;
    }
    if (overflow && onOverflow)
        onOverflow();
    if (folds.length === 0)
        return text;
    if (onFold)
        onFold();
    let res = text.slice(0, folds[0]);
    for (let i = 0; i < folds.length; ++i) {
        const fold = folds[i];
        const end = folds[i + 1] || text.length;
        if (fold === 0)
            res = `\n${indent}${text.slice(0, end)}`;
        else {
            if (mode === FOLD_QUOTED && escapedFolds[fold])
                res += `${text[fold]}\\`;
            res += `\n${indent}${text.slice(fold + 1, end)}`;
        }
    }
    return res;
}
/**
 * Presumes `i + 1` is at the start of a line
 * @returns index of last newline in more-indented block
 */
function consumeMoreIndentedLines(text, i, indent) {
    let end = i;
    let start = i + 1;
    let ch = text[start];
    while (ch === ' ' || ch === '\t') {
        if (i < start + indent) {
            ch = text[++i];
        }
        else {
            do {
                ch = text[++i];
            } while (ch && ch !== '\n');
            end = i;
            start = i + 1;
            ch = text[start];
        }
    }
    return end;
}

exports.FOLD_BLOCK = FOLD_BLOCK;
exports.FOLD_FLOW = FOLD_FLOW;
exports.FOLD_QUOTED = FOLD_QUOTED;
exports.foldFlowLines = foldFlowLines;


/***/ }),

/***/ 2148:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var anchors = __nccwpck_require__(1596);
var identity = __nccwpck_require__(1127);
var stringifyComment = __nccwpck_require__(9799);
var stringifyString = __nccwpck_require__(3069);

function createStringifyContext(doc, options) {
    const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: 'PLAIN',
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: 'false',
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: 'null',
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: 'true',
        verifyAliasOrder: true
    }, doc.schema.toStringOptions, options);
    let inFlow;
    switch (opt.collectionStyle) {
        case 'block':
            inFlow = false;
            break;
        case 'flow':
            inFlow = true;
            break;
        default:
            inFlow = null;
    }
    return {
        anchors: new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? ' ' : '',
        indent: '',
        indentStep: typeof opt.indent === 'number' ? ' '.repeat(opt.indent) : '  ',
        inFlow,
        options: opt
    };
}
function getTagObject(tags, item) {
    if (item.tag) {
        const match = tags.filter(t => t.tag === item.tag);
        if (match.length > 0)
            return match.find(t => t.format === item.format) ?? match[0];
    }
    let tagObj = undefined;
    let obj;
    if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter(t => t.identify?.(obj));
        if (match.length > 1) {
            const testMatch = match.filter(t => t.test);
            if (testMatch.length > 0)
                match = testMatch;
        }
        tagObj =
            match.find(t => t.format === item.format) ?? match.find(t => !t.format);
    }
    else {
        obj = item;
        tagObj = tags.find(t => t.nodeClass && obj instanceof t.nodeClass);
    }
    if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? 'null' : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
    }
    return tagObj;
}
// needs to be called before value stringifier to allow for circular anchor refs
function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
    if (!doc.directives)
        return '';
    const props = [];
    const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
    if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
    }
    const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
    if (tag)
        props.push(doc.directives.tagString(tag));
    return props.join(' ');
}
function stringify(item, ctx, onComment, onChompKeep) {
    if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
    if (identity.isAlias(item)) {
        if (ctx.doc.directives)
            return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
            throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        }
        else {
            if (ctx.resolvedAliases)
                ctx.resolvedAliases.add(item);
            else
                ctx.resolvedAliases = new Set([item]);
            item = item.resolve(ctx.doc);
        }
    }
    let tagObj = undefined;
    const node = identity.isNode(item)
        ? item
        : ctx.doc.createNode(item, { onTagObj: o => (tagObj = o) });
    tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
    const props = stringifyProps(node, tagObj, ctx);
    if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
    const str = typeof tagObj.stringify === 'function'
        ? tagObj.stringify(node, ctx, onComment, onChompKeep)
        : identity.isScalar(node)
            ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep)
            : node.toString(ctx, onComment, onChompKeep);
    if (!props)
        return str;
    return identity.isScalar(node) || str[0] === '{' || str[0] === '['
        ? `${props} ${str}`
        : `${props}\n${ctx.indent}${str}`;
}

exports.createStringifyContext = createStringifyContext;
exports.stringify = stringify;


/***/ }),

/***/ 1212:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var stringify = __nccwpck_require__(2148);
var stringifyComment = __nccwpck_require__(9799);

function stringifyCollection(collection, ctx, options) {
    const flow = ctx.inFlow ?? collection.flow;
    const stringify = flow ? stringifyFlowCollection : stringifyBlockCollection;
    return stringify(collection, ctx, options);
}
function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
    const { indent, options: { commentString } } = ctx;
    const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
    let chompKeep = false; // flag for the preceding node's status
    const lines = [];
    for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
            if (!chompKeep && item.spaceBefore)
                lines.push('');
            addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
            if (item.comment)
                comment = item.comment;
        }
        else if (identity.isPair(item)) {
            const ik = identity.isNode(item.key) ? item.key : null;
            if (ik) {
                if (!chompKeep && ik.spaceBefore)
                    lines.push('');
                addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
            }
        }
        chompKeep = false;
        let str = stringify.stringify(item, itemCtx, () => (comment = null), () => (chompKeep = true));
        if (comment)
            str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        if (chompKeep && comment)
            chompKeep = false;
        lines.push(blockItemPrefix + str);
    }
    let str;
    if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
    }
    else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
            const line = lines[i];
            str += line ? `\n${indent}${line}` : '\n';
        }
    }
    if (comment) {
        str += '\n' + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
            onComment();
    }
    else if (chompKeep && onChompKeep)
        onChompKeep();
    return str;
}
function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
    const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
    itemIndent += indentStep;
    const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
    });
    let reqNewline = false;
    let linesAtValue = 0;
    const lines = [];
    for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
            if (item.spaceBefore)
                lines.push('');
            addCommentBefore(ctx, lines, item.commentBefore, false);
            if (item.comment)
                comment = item.comment;
        }
        else if (identity.isPair(item)) {
            const ik = identity.isNode(item.key) ? item.key : null;
            if (ik) {
                if (ik.spaceBefore)
                    lines.push('');
                addCommentBefore(ctx, lines, ik.commentBefore, false);
                if (ik.comment)
                    reqNewline = true;
            }
            const iv = identity.isNode(item.value) ? item.value : null;
            if (iv) {
                if (iv.comment)
                    comment = iv.comment;
                if (iv.commentBefore)
                    reqNewline = true;
            }
            else if (item.value == null && ik?.comment) {
                comment = ik.comment;
            }
        }
        if (comment)
            reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => (comment = null));
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes('\n'));
        if (i < items.length - 1) {
            str += ',';
        }
        else if (ctx.options.trailingComma) {
            if (ctx.options.lineWidth > 0) {
                reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) +
                    (str.length + 2) >
                    ctx.options.lineWidth);
            }
            if (reqNewline) {
                str += ',';
            }
        }
        if (comment)
            str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
    }
    const { start, end } = flowChars;
    if (lines.length === 0) {
        return start + end;
    }
    else {
        if (!reqNewline) {
            const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
            reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
            let str = start;
            for (const line of lines)
                str += line ? `\n${indentStep}${indent}${line}` : '\n';
            return `${str}\n${indent}${end}`;
        }
        else {
            return `${start}${fcPadding}${lines.join(' ')}${fcPadding}${end}`;
        }
    }
}
function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
    if (comment && chompKeep)
        comment = comment.replace(/^\n+/, '');
    if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart()); // Avoid double indent on first line
    }
}

exports.stringifyCollection = stringifyCollection;


/***/ }),

/***/ 9799:
/***/ ((__unused_webpack_module, exports) => {



/**
 * Stringifies a comment.
 *
 * Empty comment lines are left empty,
 * lines consisting of a single space are replaced by `#`,
 * and all other lines are prefixed with a `#`.
 */
const stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, '#');
function indentComment(comment, indent) {
    if (/^\n+$/.test(comment))
        return comment.substring(1);
    return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
}
const lineComment = (str, indent, comment) => str.endsWith('\n')
    ? indentComment(comment, indent)
    : comment.includes('\n')
        ? '\n' + indentComment(comment, indent)
        : (str.endsWith(' ') ? '' : ' ') + comment;

exports.indentComment = indentComment;
exports.lineComment = lineComment;
exports.stringifyComment = stringifyComment;


/***/ }),

/***/ 6829:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var stringify = __nccwpck_require__(2148);
var stringifyComment = __nccwpck_require__(9799);

function stringifyDocument(doc, options) {
    const lines = [];
    let hasDirectives = options.directives === true;
    if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
            lines.push(dir);
            hasDirectives = true;
        }
        else if (doc.directives.docStart)
            hasDirectives = true;
    }
    if (hasDirectives)
        lines.push('---');
    const ctx = stringify.createStringifyContext(doc, options);
    const { commentString } = ctx.options;
    if (doc.commentBefore) {
        if (lines.length !== 1)
            lines.unshift('');
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ''));
    }
    let chompKeep = false;
    let contentComment = null;
    if (doc.contents) {
        if (identity.isNode(doc.contents)) {
            if (doc.contents.spaceBefore && hasDirectives)
                lines.push('');
            if (doc.contents.commentBefore) {
                const cs = commentString(doc.contents.commentBefore);
                lines.push(stringifyComment.indentComment(cs, ''));
            }
            // top-level block scalars need to be indented if followed by a comment
            ctx.forceBlockIndent = !!doc.comment;
            contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? undefined : () => (chompKeep = true);
        let body = stringify.stringify(doc.contents, ctx, () => (contentComment = null), onChompKeep);
        if (contentComment)
            body += stringifyComment.lineComment(body, '', commentString(contentComment));
        if ((body[0] === '|' || body[0] === '>') &&
            lines[lines.length - 1] === '---') {
            // Top-level block scalars with a preceding doc marker ought to use the
            // same line for their header.
            lines[lines.length - 1] = `--- ${body}`;
        }
        else
            lines.push(body);
    }
    else {
        lines.push(stringify.stringify(doc.contents, ctx));
    }
    if (doc.directives?.docEnd) {
        if (doc.comment) {
            const cs = commentString(doc.comment);
            if (cs.includes('\n')) {
                lines.push('...');
                lines.push(stringifyComment.indentComment(cs, ''));
            }
            else {
                lines.push(`... ${cs}`);
            }
        }
        else {
            lines.push('...');
        }
    }
    else {
        let dc = doc.comment;
        if (dc && chompKeep)
            dc = dc.replace(/^\n+/, '');
        if (dc) {
            if ((!chompKeep || contentComment) && lines[lines.length - 1] !== '')
                lines.push('');
            lines.push(stringifyComment.indentComment(commentString(dc), ''));
        }
    }
    return lines.join('\n') + '\n';
}

exports.stringifyDocument = stringifyDocument;


/***/ }),

/***/ 8689:
/***/ ((__unused_webpack_module, exports) => {



function stringifyNumber({ format, minFractionDigits, tag, value }) {
    if (typeof value === 'bigint')
        return String(value);
    const num = typeof value === 'number' ? value : Number(value);
    if (!isFinite(num))
        return isNaN(num) ? '.nan' : num < 0 ? '-.inf' : '.inf';
    let n = Object.is(value, -0) ? '-0' : JSON.stringify(value);
    if (!format &&
        minFractionDigits &&
        (!tag || tag === 'tag:yaml.org,2002:float') &&
        /^-?\d/.test(n) &&
        !n.includes('e')) {
        let i = n.indexOf('.');
        if (i < 0) {
            i = n.length;
            n += '.';
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
            n += '0';
    }
    return n;
}

exports.stringifyNumber = stringifyNumber;


/***/ }),

/***/ 9748:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);
var Scalar = __nccwpck_require__(3301);
var stringify = __nccwpck_require__(2148);
var stringifyComment = __nccwpck_require__(9799);

function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
    const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
    let keyComment = (identity.isNode(key) && key.comment) || null;
    if (simpleKeys) {
        if (keyComment) {
            throw new Error('With simple keys, key nodes cannot have comments');
        }
        if (identity.isCollection(key) || (!identity.isNode(key) && typeof key === 'object')) {
            const msg = 'With simple keys, collection cannot be used as a key value';
            throw new Error(msg);
        }
    }
    let explicitKey = !simpleKeys &&
        (!key ||
            (keyComment && value == null && !ctx.inFlow) ||
            identity.isCollection(key) ||
            (identity.isScalar(key)
                ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL
                : typeof key === 'object'));
    ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
    });
    let keyCommentDone = false;
    let chompKeep = false;
    let str = stringify.stringify(key, ctx, () => (keyCommentDone = true), () => (chompKeep = true));
    if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
            throw new Error('With simple keys, single line scalar must not span more than 1024 characters');
        explicitKey = true;
    }
    if (ctx.inFlow) {
        if (allNullValues || value == null) {
            if (keyCommentDone && onComment)
                onComment();
            return str === '' ? '?' : explicitKey ? `? ${str}` : str;
        }
    }
    else if ((allNullValues && !simpleKeys) || (value == null && explicitKey)) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
            str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        }
        else if (chompKeep && onChompKeep)
            onChompKeep();
        return str;
    }
    if (keyCommentDone)
        keyComment = null;
    if (explicitKey) {
        if (keyComment)
            str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}\n${indent}:`;
    }
    else {
        str = `${str}:`;
        if (keyComment)
            str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
    }
    let vsb, vcb, valueComment;
    if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
    }
    else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === 'object')
            value = doc.createNode(value);
    }
    ctx.implicitKey = false;
    if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
    chompKeep = false;
    if (!indentSeq &&
        indentStep.length >= 2 &&
        !ctx.inFlow &&
        !explicitKey &&
        identity.isSeq(value) &&
        !value.flow &&
        !value.tag &&
        !value.anchor) {
        // If indentSeq === false, consider '- ' as part of indentation where possible
        ctx.indent = ctx.indent.substring(2);
    }
    let valueCommentDone = false;
    const valueStr = stringify.stringify(value, ctx, () => (valueCommentDone = true), () => (chompKeep = true));
    let ws = ' ';
    if (keyComment || vsb || vcb) {
        ws = vsb ? '\n' : '';
        if (vcb) {
            const cs = commentString(vcb);
            ws += `\n${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === '' && !ctx.inFlow) {
            if (ws === '\n' && valueComment)
                ws = '\n\n';
        }
        else {
            ws += `\n${ctx.indent}`;
        }
    }
    else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf('\n');
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
            let hasPropsLine = false;
            if (hasNewline && (vs0 === '&' || vs0 === '!')) {
                let sp0 = valueStr.indexOf(' ');
                if (vs0 === '&' &&
                    sp0 !== -1 &&
                    sp0 < nl0 &&
                    valueStr[sp0 + 1] === '!') {
                    sp0 = valueStr.indexOf(' ', sp0 + 1);
                }
                if (sp0 === -1 || nl0 < sp0)
                    hasPropsLine = true;
            }
            if (!hasPropsLine)
                ws = `\n${ctx.indent}`;
        }
    }
    else if (valueStr === '' || valueStr[0] === '\n') {
        ws = '';
    }
    str += ws + valueStr;
    if (ctx.inFlow) {
        if (valueCommentDone && onComment)
            onComment();
    }
    else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
    }
    else if (chompKeep && onChompKeep) {
        onChompKeep();
    }
    return str;
}

exports.stringifyPair = stringifyPair;


/***/ }),

/***/ 3069:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var Scalar = __nccwpck_require__(3301);
var foldFlowLines = __nccwpck_require__(4475);

const getFoldOptions = (ctx, isBlock) => ({
    indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
    lineWidth: ctx.options.lineWidth,
    minContentWidth: ctx.options.minContentWidth
});
// Also checks for lines starting with %, as parsing the output as YAML 1.1 will
// presume that's starting a new document.
const containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
function lineLengthOverLimit(str, lineWidth, indentLength) {
    if (!lineWidth || lineWidth < 0)
        return false;
    const limit = lineWidth - indentLength;
    const strLen = str.length;
    if (strLen <= limit)
        return false;
    for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === '\n') {
            if (i - start > limit)
                return true;
            start = i + 1;
            if (strLen - start <= limit)
                return false;
        }
    }
    return true;
}
function doubleQuotedString(value, ctx) {
    const json = JSON.stringify(value);
    if (ctx.options.doubleQuotedAsJSON)
        return json;
    const { implicitKey } = ctx;
    const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
    const indent = ctx.indent || (containsDocumentMarker(value) ? '  ' : '');
    let str = '';
    let start = 0;
    for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === ' ' && json[i + 1] === '\\' && json[i + 2] === 'n') {
            // space before newline needs to be escaped to not be folded
            str += json.slice(start, i) + '\\ ';
            i += 1;
            start = i;
            ch = '\\';
        }
        if (ch === '\\')
            switch (json[i + 1]) {
                case 'u':
                    {
                        str += json.slice(start, i);
                        const code = json.substr(i + 2, 4);
                        switch (code) {
                            case '0000':
                                str += '\\0';
                                break;
                            case '0007':
                                str += '\\a';
                                break;
                            case '000b':
                                str += '\\v';
                                break;
                            case '001b':
                                str += '\\e';
                                break;
                            case '0085':
                                str += '\\N';
                                break;
                            case '00a0':
                                str += '\\_';
                                break;
                            case '2028':
                                str += '\\L';
                                break;
                            case '2029':
                                str += '\\P';
                                break;
                            default:
                                if (code.substr(0, 2) === '00')
                                    str += '\\x' + code.substr(2);
                                else
                                    str += json.substr(i, 6);
                        }
                        i += 5;
                        start = i + 1;
                    }
                    break;
                case 'n':
                    if (implicitKey ||
                        json[i + 2] === '"' ||
                        json.length < minMultiLineLength) {
                        i += 1;
                    }
                    else {
                        // folding will eat first newline
                        str += json.slice(start, i) + '\n\n';
                        while (json[i + 2] === '\\' &&
                            json[i + 3] === 'n' &&
                            json[i + 4] !== '"') {
                            str += '\n';
                            i += 2;
                        }
                        str += indent;
                        // space after newline needs to be escaped to not be folded
                        if (json[i + 2] === ' ')
                            str += '\\';
                        i += 1;
                        start = i + 1;
                    }
                    break;
                default:
                    i += 1;
            }
    }
    str = start ? str + json.slice(start) : json;
    return implicitKey
        ? str
        : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
}
function singleQuotedString(value, ctx) {
    if (ctx.options.singleQuote === false ||
        (ctx.implicitKey && value.includes('\n')) ||
        /[ \t]\n|\n[ \t]/.test(value) // single quoted string can't have leading or trailing whitespace around newline
    )
        return doubleQuotedString(value, ctx);
    const indent = ctx.indent || (containsDocumentMarker(value) ? '  ' : '');
    const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&\n${indent}`) + "'";
    return ctx.implicitKey
        ? res
        : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
}
function quotedString(value, ctx) {
    const { singleQuote } = ctx.options;
    let qs;
    if (singleQuote === false)
        qs = doubleQuotedString;
    else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
            qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
            qs = doubleQuotedString;
        else
            qs = singleQuote ? singleQuotedString : doubleQuotedString;
    }
    return qs(value, ctx);
}
// The negative lookbehind avoids a polynomial search,
// but isn't supported yet on Safari: https://caniuse.com/js-regexp-lookbehind
let blockEndNewlines;
try {
    blockEndNewlines = new RegExp('(^|(?<!\n))\n+(?!\n|$)', 'g');
}
catch {
    blockEndNewlines = /\n+(?!\n|$)/g;
}
function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
    const { blockQuote, commentString, lineWidth } = ctx.options;
    // 1. Block can't end in whitespace unless the last line is non-empty.
    // 2. Strings consisting of only whitespace are best rendered explicitly.
    if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
    }
    const indent = ctx.indent ||
        (ctx.forceBlockIndent || containsDocumentMarker(value) ? '  ' : '');
    const literal = blockQuote === 'literal'
        ? true
        : blockQuote === 'folded' || type === Scalar.Scalar.BLOCK_FOLDED
            ? false
            : type === Scalar.Scalar.BLOCK_LITERAL
                ? true
                : !lineLengthOverLimit(value, lineWidth, indent.length);
    if (!value)
        return literal ? '|\n' : '>\n';
    // determine chomping from whitespace at value end
    let chomp;
    let endStart;
    for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== '\n' && ch !== '\t' && ch !== ' ')
            break;
    }
    let end = value.substring(endStart);
    const endNlPos = end.indexOf('\n');
    if (endNlPos === -1) {
        chomp = '-'; // strip
    }
    else if (value === end || endNlPos !== end.length - 1) {
        chomp = '+'; // keep
        if (onChompKeep)
            onChompKeep();
    }
    else {
        chomp = ''; // clip
    }
    if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === '\n')
            end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
    }
    // determine indent indicator from whitespace at value start
    let startWithSpace = false;
    let startEnd;
    let startNlPos = -1;
    for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === ' ')
            startWithSpace = true;
        else if (ch === '\n')
            startNlPos = startEnd;
        else
            break;
    }
    let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
    if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
    }
    const indentSize = indent ? '2' : '1'; // root is at -1
    // Leading | or > is added later
    let header = (startWithSpace ? indentSize : '') + chomp;
    if (comment) {
        header += ' ' + commentString(comment.replace(/ ?[\r\n]+/g, ' '));
        if (onComment)
            onComment();
    }
    if (!literal) {
        const foldedValue = value
            .replace(/\n+/g, '\n$&')
            .replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, '$1$2') // more-indented lines aren't folded
            //                ^ more-ind. ^ empty     ^ capture next empty lines only at end of indent
            .replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== 'folded' && type !== Scalar.Scalar.BLOCK_FOLDED) {
            foldOptions.onOverflow = () => {
                literalFallback = true;
            };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
            return `>${header}\n${indent}${body}`;
    }
    value = value.replace(/\n+/g, `$&${indent}`);
    return `|${header}\n${indent}${start}${value}${end}`;
}
function plainString(item, ctx, onComment, onChompKeep) {
    const { type, value } = item;
    const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
    if ((implicitKey && value.includes('\n')) ||
        (inFlow && /[[\]{},]/.test(value))) {
        return quotedString(value, ctx);
    }
    if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        // not allowed:
        // - '-' or '?'
        // - start with an indicator character (except [?:-]) or /[?-] /
        // - '\n ', ': ' or ' \n' anywhere
        // - '#' not preceded by a non-space char
        // - end with ' ' or ':'
        return implicitKey || inFlow || !value.includes('\n')
            ? quotedString(value, ctx)
            : blockString(item, ctx, onComment, onChompKeep);
    }
    if (!implicitKey &&
        !inFlow &&
        type !== Scalar.Scalar.PLAIN &&
        value.includes('\n')) {
        // Where allowed & type not set explicitly, prefer block style for multiline strings
        return blockString(item, ctx, onComment, onChompKeep);
    }
    if (containsDocumentMarker(value)) {
        if (indent === '') {
            ctx.forceBlockIndent = true;
            return blockString(item, ctx, onComment, onChompKeep);
        }
        else if (implicitKey && indent === indentStep) {
            return quotedString(value, ctx);
        }
    }
    const str = value.replace(/\n+/g, `$&\n${indent}`);
    // Verify that output will be parsed as a string, as e.g. plain numbers and
    // booleans get parsed with those types in v1.2 (e.g. '42', 'true' & '0.9e-3'),
    // and others in v1.1.
    if (actualString) {
        const test = (tag) => tag.default && tag.tag !== 'tag:yaml.org,2002:str' && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
            return quotedString(value, ctx);
    }
    return implicitKey
        ? str
        : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
}
function stringifyString(item, ctx, onComment, onChompKeep) {
    const { implicitKey, inFlow } = ctx;
    const ss = typeof item.value === 'string'
        ? item
        : Object.assign({}, item, { value: String(item.value) });
    let { type } = item;
    if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        // force double quotes on control characters & unpaired surrogates
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
            type = Scalar.Scalar.QUOTE_DOUBLE;
    }
    const _stringify = (_type) => {
        switch (_type) {
            case Scalar.Scalar.BLOCK_FOLDED:
            case Scalar.Scalar.BLOCK_LITERAL:
                return implicitKey || inFlow
                    ? quotedString(ss.value, ctx) // blocks are not valid inside flow containers
                    : blockString(ss, ctx, onComment, onChompKeep);
            case Scalar.Scalar.QUOTE_DOUBLE:
                return doubleQuotedString(ss.value, ctx);
            case Scalar.Scalar.QUOTE_SINGLE:
                return singleQuotedString(ss.value, ctx);
            case Scalar.Scalar.PLAIN:
                return plainString(ss, ctx, onComment, onChompKeep);
            default:
                return null;
        }
    };
    let res = _stringify(type);
    if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = (implicitKey && defaultKeyType) || defaultStringType;
        res = _stringify(t);
        if (res === null)
            throw new Error(`Unsupported default string type ${t}`);
    }
    return res;
}

exports.stringifyString = stringifyString;


/***/ }),

/***/ 204:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {



var identity = __nccwpck_require__(1127);

const BREAK = Symbol('break visit');
const SKIP = Symbol('skip children');
const REMOVE = Symbol('remove node');
/**
 * Apply a visitor to an AST node or document.
 *
 * Walks through the tree (depth-first) starting from `node`, calling a
 * `visitor` function with three arguments:
 *   - `key`: For sequence values and map `Pair`, the node's index in the
 *     collection. Within a `Pair`, `'key'` or `'value'`, correspondingly.
 *     `null` for the root node.
 *   - `node`: The current node.
 *   - `path`: The ancestry of the current node.
 *
 * The return value of the visitor may be used to control the traversal:
 *   - `undefined` (default): Do nothing and continue
 *   - `visit.SKIP`: Do not visit the children of this node, continue with next
 *     sibling
 *   - `visit.BREAK`: Terminate traversal completely
 *   - `visit.REMOVE`: Remove the current node, then continue with the next one
 *   - `Node`: Replace the current node, then continue by visiting it
 *   - `number`: While iterating the items of a sequence or map, set the index
 *     of the next step. This is useful especially if the index of the current
 *     node has changed.
 *
 * If `visitor` is a single function, it will be called with all values
 * encountered in the tree, including e.g. `null` values. Alternatively,
 * separate visitor functions may be defined for each `Map`, `Pair`, `Seq`,
 * `Alias` and `Scalar` node. To define the same visitor function for more than
 * one node type, use the `Collection` (map and seq), `Value` (map, seq & scalar)
 * and `Node` (alias, map, seq & scalar) targets. Of all these, only the most
 * specific defined one will be used for each node.
 */
function visit(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
            node.contents = null;
    }
    else
        visit_(null, node, visitor_, Object.freeze([]));
}
// Without the `as symbol` casts, TS declares these in the `visit`
// namespace using `var`, but then complains about that because
// `unique symbol` must be `const`.
/** Terminate visit traversal completely */
visit.BREAK = BREAK;
/** Do not visit the children of the current node */
visit.SKIP = SKIP;
/** Remove the current node */
visit.REMOVE = REMOVE;
function visit_(key, node, visitor, path) {
    const ctrl = callVisitor(key, node, visitor, path);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== 'symbol') {
        if (identity.isCollection(node)) {
            path = Object.freeze(path.concat(node));
            for (let i = 0; i < node.items.length; ++i) {
                const ci = visit_(i, node.items[i], visitor, path);
                if (typeof ci === 'number')
                    i = ci - 1;
                else if (ci === BREAK)
                    return BREAK;
                else if (ci === REMOVE) {
                    node.items.splice(i, 1);
                    i -= 1;
                }
            }
        }
        else if (identity.isPair(node)) {
            path = Object.freeze(path.concat(node));
            const ck = visit_('key', node.key, visitor, path);
            if (ck === BREAK)
                return BREAK;
            else if (ck === REMOVE)
                node.key = null;
            const cv = visit_('value', node.value, visitor, path);
            if (cv === BREAK)
                return BREAK;
            else if (cv === REMOVE)
                node.value = null;
        }
    }
    return ctrl;
}
/**
 * Apply an async visitor to an AST node or document.
 *
 * Walks through the tree (depth-first) starting from `node`, calling a
 * `visitor` function with three arguments:
 *   - `key`: For sequence values and map `Pair`, the node's index in the
 *     collection. Within a `Pair`, `'key'` or `'value'`, correspondingly.
 *     `null` for the root node.
 *   - `node`: The current node.
 *   - `path`: The ancestry of the current node.
 *
 * The return value of the visitor may be used to control the traversal:
 *   - `Promise`: Must resolve to one of the following values
 *   - `undefined` (default): Do nothing and continue
 *   - `visit.SKIP`: Do not visit the children of this node, continue with next
 *     sibling
 *   - `visit.BREAK`: Terminate traversal completely
 *   - `visit.REMOVE`: Remove the current node, then continue with the next one
 *   - `Node`: Replace the current node, then continue by visiting it
 *   - `number`: While iterating the items of a sequence or map, set the index
 *     of the next step. This is useful especially if the index of the current
 *     node has changed.
 *
 * If `visitor` is a single function, it will be called with all values
 * encountered in the tree, including e.g. `null` values. Alternatively,
 * separate visitor functions may be defined for each `Map`, `Pair`, `Seq`,
 * `Alias` and `Scalar` node. To define the same visitor function for more than
 * one node type, use the `Collection` (map and seq), `Value` (map, seq & scalar)
 * and `Node` (alias, map, seq & scalar) targets. Of all these, only the most
 * specific defined one will be used for each node.
 */
async function visitAsync(node, visitor) {
    const visitor_ = initVisitor(visitor);
    if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
            node.contents = null;
    }
    else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
}
// Without the `as symbol` casts, TS declares these in the `visit`
// namespace using `var`, but then complains about that because
// `unique symbol` must be `const`.
/** Terminate visit traversal completely */
visitAsync.BREAK = BREAK;
/** Do not visit the children of the current node */
visitAsync.SKIP = SKIP;
/** Remove the current node */
visitAsync.REMOVE = REMOVE;
async function visitAsync_(key, node, visitor, path) {
    const ctrl = await callVisitor(key, node, visitor, path);
    if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
    }
    if (typeof ctrl !== 'symbol') {
        if (identity.isCollection(node)) {
            path = Object.freeze(path.concat(node));
            for (let i = 0; i < node.items.length; ++i) {
                const ci = await visitAsync_(i, node.items[i], visitor, path);
                if (typeof ci === 'number')
                    i = ci - 1;
                else if (ci === BREAK)
                    return BREAK;
                else if (ci === REMOVE) {
                    node.items.splice(i, 1);
                    i -= 1;
                }
            }
        }
        else if (identity.isPair(node)) {
            path = Object.freeze(path.concat(node));
            const ck = await visitAsync_('key', node.key, visitor, path);
            if (ck === BREAK)
                return BREAK;
            else if (ck === REMOVE)
                node.key = null;
            const cv = await visitAsync_('value', node.value, visitor, path);
            if (cv === BREAK)
                return BREAK;
            else if (cv === REMOVE)
                node.value = null;
        }
    }
    return ctrl;
}
function initVisitor(visitor) {
    if (typeof visitor === 'object' &&
        (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
            Alias: visitor.Node,
            Map: visitor.Node,
            Scalar: visitor.Node,
            Seq: visitor.Node
        }, visitor.Value && {
            Map: visitor.Value,
            Scalar: visitor.Value,
            Seq: visitor.Value
        }, visitor.Collection && {
            Map: visitor.Collection,
            Seq: visitor.Collection
        }, visitor);
    }
    return visitor;
}
function callVisitor(key, node, visitor, path) {
    if (typeof visitor === 'function')
        return visitor(key, node, path);
    if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
    if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
    if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
    if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
    if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
    return undefined;
}
function replaceNode(key, path, node) {
    const parent = path[path.length - 1];
    if (identity.isCollection(parent)) {
        parent.items[key] = node;
    }
    else if (identity.isPair(parent)) {
        if (key === 'key')
            parent.key = node;
        else
            parent.value = node;
    }
    else if (identity.isDocument(parent)) {
        parent.contents = node;
    }
    else {
        const pt = identity.isAlias(parent) ? 'alias' : 'scalar';
        throw new Error(`Cannot replace node with ${pt} parent`);
    }
}

exports.visit = visit;
exports.visitAsync = visitAsync;


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
/******/ /* webpack/runtime/compat get default export */
/******/ (() => {
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__nccwpck_require__.n = (module) => {
/******/ 		var getter = module && module.__esModule ?
/******/ 			() => (module['default']) :
/******/ 			() => (module);
/******/ 		__nccwpck_require__.d(getter, { a: getter });
/******/ 		return getter;
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/define property getters */
/******/ (() => {
/******/ 	// define getter functions for harmony exports
/******/ 	__nccwpck_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__nccwpck_require__.o(definition, key) && !__nccwpck_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ (() => {
/******/ 	__nccwpck_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ })();
/******/ 
/******/ /* webpack/runtime/compat */
/******/ 
/******/ if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = new URL('.', import.meta.url).pathname.slice(import.meta.url.match(/^file:\/\/\/\w:/) ? 1 : 0, -1) + "/";
/******/ 
/************************************************************************/
var __webpack_exports__ = {};

// EXPORTS
__nccwpck_require__.d(__webpack_exports__, {
  QH: () => (/* binding */ buildPackageTokenMap),
  SB: () => (/* binding */ parseArgv),
  rf: () => (/* binding */ resolveArgv),
  u9: () => (/* binding */ resolveBreakerToken),
  d1: () => (/* binding */ runCommand),
  vL: () => (/* binding */ tokenizeArgs)
});

;// CONCATENATED MODULE: external "node:fs/promises"
const promises_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:fs/promises");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:path");
var external_node_path_default = /*#__PURE__*/__nccwpck_require__.n(external_node_path_namespaceObject);
;// CONCATENATED MODULE: ./registry/package-name.ts
/** Validates and brands a raw string as a {@link PackageName}. */
function packageName(value) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error("package name must be a non-empty string");
    }
    if (value.startsWith("/") || value.endsWith("/") || value.includes("//")) {
        throw new Error(`invalid package name: ${JSON.stringify(value)}`);
    }
    return value;
}

;// CONCATENATED MODULE: ./registry/status.ts
/** Pure classification of an HTTP status code. No I/O. */
function classifyStatus(status) {
    if (status === 404) {
        return "not-found";
    }
    if (status === 429 || (status >= 500 && status <= 599)) {
        return "transient";
    }
    if (status >= 200 && status < 300) {
        return "success";
    }
    return "client-error";
}
/** Whether a status code warrants a retry (429 or 5xx). */
function shouldRetryStatus(status) {
    return classifyStatus(status) === "transient";
}

;// CONCATENATED MODULE: ./registry/http.ts

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const defaultBackoff = (attempt) => attempt * 2000;
/**
 * Performs an HTTP request, retrying up to `attempts` times (default 3) on
 * 429, 5xx, and network-level failures, with a linear backoff between
 * attempts. This is the direct replacement for the bash `request_with_retry`
 * helper duplicated byte-identically across the tidy/audit scripts.
 *
 * Always resolves (never rejects) with the last observed outcome, whether
 * that is a response or a network error, so callers get a uniform value to
 * classify rather than a mix of return values and thrown exceptions.
 */
async function requestWithRetry(url, init, options = {}) {
    const attempts = options.attempts ?? 3;
    const fetchImpl = options.fetchImpl ?? fetch;
    const sleep = options.sleep ?? defaultSleep;
    const backoffMs = options.backoffMs ?? defaultBackoff;
    let lastOutcome = {
        kind: "network-error",
        error: new Error("requestWithRetry: attempts must be >= 1"),
    };
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const res = await fetchImpl(url, init);
            const bodyText = await res.text();
            const outcome = {
                kind: "response",
                status: res.status,
                headers: res.headers,
                bodyText,
            };
            lastOutcome = outcome;
            if (shouldRetryStatus(res.status) && attempt < attempts) {
                await sleep(backoffMs(attempt));
                continue;
            }
            return outcome;
        }
        catch (error) {
            lastOutcome = { kind: "network-error", error };
            if (attempt < attempts) {
                await sleep(backoffMs(attempt));
                continue;
            }
        }
    }
    return lastOutcome;
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
 * `annotations["vnd.docker.reference.type"] === "attestation-manifest"` —
 * NOT something returned by the `/v2/<img>/referrers/<digest>` endpoint,
 * which returns 0 results for these. Do not build referrers-API logic to
 * find them; they are already covered by index-children traversal.
 */
function isAttestationChild(child) {
    return child.annotations?.[ATTESTATION_ANNOTATION_KEY] === ATTESTATION_ANNOTATION_VALUE;
}
/**
 * Parses a manifest response body into its media type and (for an index)
 * its direct children. Pure, no I/O — this is the media-type dispatch and
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
 * (genuinely dead child — safe to treat as unreachable) from a 429/5xx that
 * survived retries (transient — must NOT be treated as dead; the bash
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
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
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


// EXTERNAL MODULE: ./node_modules/fast-content-type-parse/index.js
var fast_content_type_parse = __nccwpck_require__(1120);
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
    super(message);
    this.name = "HttpError";
    this.status = Number.parseInt(statusCode);
    if (Number.isNaN(this.status)) {
      this.status = 0;
    }
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
var dist_bundle_VERSION = "9.2.4";

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

async function fetchWrapper(requestOptions) {
  const fetch = requestOptions.request?.fetch || globalThis.fetch;
  if (!fetch) {
    throw new Error(
      "fetch is not set. Please pass a fetch implementation as new Octokit({ request: { fetch }}). Learn more at https://github.com/octokit/octokit.js/#fetch-missing"
    );
  }
  const log = requestOptions.request?.log || console;
  const parseSuccessResponseBody = requestOptions.request?.parseSuccessResponseBody !== false;
  const body = dist_bundle_isPlainObject(requestOptions.body) || Array.isArray(requestOptions.body) ? JSON.stringify(requestOptions.body) : requestOptions.body;
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
    return response.text().catch(() => "");
  }
  const mimetype = (0,fast_content_type_parse/* safeParse */.xL)(contentType);
  if (isJSONResponse(mimetype)) {
    let text = "";
    try {
      text = await response.text();
      return JSON.parse(text);
    } catch (err) {
      return text;
    }
  } else if (mimetype.type.startsWith("text/") || mimetype.parameters.charset?.toLowerCase() === "utf-8") {
    return response.text().catch(() => "");
  } else {
    return response.arrayBuffer().catch(() => new ArrayBuffer(0));
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
  if ("message" in data) {
    const suffix = "documentation_url" in data ? ` - ${data.documentation_url}` : "";
    return Array.isArray(data.errors) ? `${data.message}: ${data.errors.map((v) => JSON.stringify(v)).join(", ")}${suffix}` : `${data.message}${suffix}`;
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
const version_VERSION = "6.1.6";


;// CONCATENATED MODULE: ./node_modules/@octokit/core/dist-src/index.js






const noop = () => {
};
const consoleWarn = console.warn.bind(console);
const consoleError = console.error.bind(console);
function createLogger(logger = {}) {
  if (typeof logger.debug !== "function") {
    logger.debug = noop;
  }
  if (typeof logger.info !== "function") {
    logger.info = noop;
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
  const responseNeedsNormalization = "total_count" in response.data && !("url" in response.data);
  if (!responseNeedsNormalization) return response;
  const incompleteResults = response.data.incomplete_results;
  const repositorySelection = response.data.repository_selection;
  const totalCount = response.data.total_count;
  delete response.data.incomplete_results;
  delete response.data.repository_selection;
  delete response.data.total_count;
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
  "GET /enterprises/{enterprise}/secret-scanning/alerts",
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
  "GET /orgs/{org}/actions/cache/usage-by-repository",
  "GET /orgs/{org}/actions/hosted-runners",
  "GET /orgs/{org}/actions/permissions/repositories",
  "GET /orgs/{org}/actions/runner-groups",
  "GET /orgs/{org}/actions/runner-groups/{runner_group_id}/hosted-runners",
  "GET /orgs/{org}/actions/runner-groups/{runner_group_id}/repositories",
  "GET /orgs/{org}/actions/runner-groups/{runner_group_id}/runners",
  "GET /orgs/{org}/actions/runners",
  "GET /orgs/{org}/actions/secrets",
  "GET /orgs/{org}/actions/secrets/{secret_name}/repositories",
  "GET /orgs/{org}/actions/variables",
  "GET /orgs/{org}/actions/variables/{name}/repositories",
  "GET /orgs/{org}/attestations/{subject_digest}",
  "GET /orgs/{org}/blocks",
  "GET /orgs/{org}/code-scanning/alerts",
  "GET /orgs/{org}/code-security/configurations",
  "GET /orgs/{org}/code-security/configurations/{configuration_id}/repositories",
  "GET /orgs/{org}/codespaces",
  "GET /orgs/{org}/codespaces/secrets",
  "GET /orgs/{org}/codespaces/secrets/{secret_name}/repositories",
  "GET /orgs/{org}/copilot/billing/seats",
  "GET /orgs/{org}/copilot/metrics",
  "GET /orgs/{org}/copilot/usage",
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
  "GET /orgs/{org}/projects",
  "GET /orgs/{org}/properties/values",
  "GET /orgs/{org}/public_members",
  "GET /orgs/{org}/repos",
  "GET /orgs/{org}/rulesets",
  "GET /orgs/{org}/rulesets/rule-suites",
  "GET /orgs/{org}/rulesets/{ruleset_id}/history",
  "GET /orgs/{org}/secret-scanning/alerts",
  "GET /orgs/{org}/security-advisories",
  "GET /orgs/{org}/settings/network-configurations",
  "GET /orgs/{org}/team/{team_slug}/copilot/metrics",
  "GET /orgs/{org}/team/{team_slug}/copilot/usage",
  "GET /orgs/{org}/teams",
  "GET /orgs/{org}/teams/{team_slug}/discussions",
  "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments",
  "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/comments/{comment_number}/reactions",
  "GET /orgs/{org}/teams/{team_slug}/discussions/{discussion_number}/reactions",
  "GET /orgs/{org}/teams/{team_slug}/invitations",
  "GET /orgs/{org}/teams/{team_slug}/members",
  "GET /orgs/{org}/teams/{team_slug}/projects",
  "GET /orgs/{org}/teams/{team_slug}/repos",
  "GET /orgs/{org}/teams/{team_slug}/teams",
  "GET /projects/columns/{column_id}/cards",
  "GET /projects/{project_id}/collaborators",
  "GET /projects/{project_id}/columns",
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
  "GET /repos/{owner}/{repo}/projects",
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
  "GET /teams/{team_id}/projects",
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
  "GET /users/{username}/projects",
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


// EXTERNAL MODULE: ./node_modules/bottleneck/light.js
var light = __nccwpck_require__(3251);
;// CONCATENATED MODULE: ./node_modules/@octokit/plugin-retry/dist-bundle/index.js
// pkg/dist-src/version.js
var plugin_retry_dist_bundle_VERSION = "0.0.0-development";

// pkg/dist-src/error-request.js
async function errorRequest(state, octokit, error, options) {
  if (!error.request || !error.request.request) {
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
    const maxRetries = ~~error.request.request.retries;
    const after = ~~error.request.request.retryAfter;
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
  const response = await request(request, options);
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
  if (state.enabled) {
    octokit.hook.error("request", errorRequest.bind(null, state, octokit));
    octokit.hook.wrap("request", wrapRequest.bind(null, state, octokit));
  }
  return {
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
  if (groups.global == null) {
    createGroups(Bottleneck, common);
  }
  const state = Object.assign(
    {
      clustering: connection != null,
      triggersNotification,
      fallbackSecondaryRateRetryAfter: 60,
      retryAfterBaseValue: 1e3,
      retryLimiter: new Bottleneck(),
      id,
      ...groups
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
    const { wantRetry, retryAfter = 0 } = await async function() {
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
    }();
    if (wantRetry) {
      request.retryCount++;
      return retryAfter * state2.retryAfterBaseValue;
    }
  });
  octokit.hook.wrap("request", dist_bundle_wrapRequest.bind(null, state));
  return {};
}
throttling.VERSION = plugin_throttling_dist_bundle_VERSION;
throttling.triggersNotification = triggersNotification;


;// CONCATENATED MODULE: ./registry/packages.ts




/**
 * The Octokit class this module is built for: core + pagination + retry +
 * throttling. This is a primary reason TypeScript replaces the bash here —
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
        throttle: {
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
 * not treat the result of this call as authoritative for read-after-write —
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
 * NOT documented by GitHub — their docs list only 204/401/403/404 for this
 * endpoint and actually claim the opposite): deleting the LAST remaining
 * version of a package via this endpoint returns HTTP 400. Deleting the
 * package itself (see {@link deletePackage}) succeeds with 204 even while
 * versions remain.
 *
 * Consequently this function surfaces a 400 as `"last-version-conflict"`
 * instead of throwing a generic error. Callers must NOT retry the version
 * delete in a loop expecting it to eventually succeed — that loop never
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








;// CONCATENATED MODULE: ./registry/tags.ts


/**
 * Parses the `Link` header GHCR returns on a paginated `tags/list` response
 * and extracts the `rel="next"` URL, or `undefined` on the last page.
 * Mirrors the same relation the bash predecessor followed by hand with
 * `grep`/`sed`; kept as a small pure function so it is unit-testable
 * against real header fixtures without mocking `fetch`.
 */
function parseNextLink(header) {
    if (!header) {
        return undefined;
    }
    const part = header
        .split(",")
        .map((p) => p.trim())
        .find((p) => /rel="next"/.test(p));
    if (!part) {
        return undefined;
    }
    const match = /<([^>]+)>/.exec(part);
    return match?.[1];
}
/**
 * Lists every tag of a package by following `https://ghcr.io/v2/<registryPath>/tags/list`,
 * paginating via the `Link: rel="next"` header GHCR returns once a package
 * has more tags than fit on one page.
 *
 * MUST paginate: `baseimages/python` was observed returning exactly 100 tags
 * at `?n=100` — i.e. truncated — so a single-page read computes ROOTS from a
 * partial view of the registry and silently under-protects (or, worse,
 * under-deletes-then-corrects-later) whatever tags fall past the first page.
 *
 * GHCR's `Link` header is ORIGIN-RELATIVE (verified live 2026-09-11 against
 * `ghcr.io/v2/pyck-ai/baseimages/agent/tags/list`:
 * `link: </v2/pyck-ai/baseimages/agent/tags/list?last=...&n=...>; rel="next"`
 * — no scheme or host), per the OCI distribution spec's own pagination
 * example. `parseNextLink` returns that raw value verbatim, so it MUST be
 * resolved against the previous request's URL before being fetched:
 * passing a bare path straight to `fetch` throws (`TypeError: Failed to
 * parse URL`), which `requestWithRetry` catches and reports as
 * `"network-error"` on every retry — indistinguishable from a real network
 * failure, but 100% reproducible for any package with more than one page
 * of tags (i.e. the moment pagination is actually exercised) and NOT
 * something retrying helps with. This was the exact cause of
 * `baseimages/agent`'s `network-error` in production: it has >100 tags,
 * `rover` (1 tag, no pagination) did not hit it.
 *
 * Classifies the observed status the same way {@link resolveManifest} does,
 * so a caller building ghcr-tidy's LIVE_ROOTS can distinguish a genuine
 * 404 (package has no tags endpoint — unusual, but not the same as "zero
 * tags") from a transient failure that must not be treated as "no tags".
 */
async function listRegistryTags(registryPath, token, options = {}) {
    const tags = [];
    let url = `https://ghcr.io/v2/${registryPath}/tags/list?n=100`;
    while (url) {
        const outcome = await requestWithRetry(url, { headers: { Authorization: `Bearer ${token}` } }, options);
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
        let parsed;
        try {
            parsed = JSON.parse(outcome.bodyText);
        }
        catch {
            parsed = {};
        }
        tags.push(...(parsed.tags ?? []));
        const next = parseNextLink(outcome.headers.get("link"));
        // Resolve against the URL just fetched: `next` is ORIGIN-RELATIVE in
        // practice (see this function's doc), but `new URL` also accepts an
        // already-absolute `next` unchanged, so this is correct either way.
        url = next !== undefined ? new URL(next, url).toString() : undefined;
    }
    return { status: "success", tags };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/domain.ts
/**
 * Validates and brands a raw string as a {@link Digest}. Deliberately only
 * checks the `<algorithm>:<content>` shape (OCI's own digest grammar,
 * `algorithm ::= component ( '+' component )*`, `component` alphanumeric),
 * not that `<content>` is valid hex of the right length for `sha256` —
 * fixtures across the test suite use short, readable placeholders like
 * `"sha256:child"`, and this constructor's job is to keep a `Tag` from
 * being used where a `Digest` is required, not to re-implement the OCI
 * spec's digest grammar.
 */
function digest(value) {
    if (typeof value !== "string" || !/^[a-z0-9]+(?:\+[a-z0-9]+)*:[^\s:]+$/.test(value)) {
        throw new Error(`invalid digest: ${JSON.stringify(value)}`);
    }
    return value;
}
/** Validates and brands a raw string as a {@link Tag}. */
function tag(value) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`invalid tag: ${JSON.stringify(value)}`);
    }
    return value;
}
/** The one and only way to construct a {@link RegistryPath}: from an owner and a {@link PackageName}. */
function registryPathFor(owner, name) {
    if (typeof owner !== "string" || owner.length === 0) {
        throw new Error(`invalid registry owner: ${JSON.stringify(owner)}`);
    }
    return `${owner}/${name}`;
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/adapters.ts




/**
 * The real {@link RegistryReader}: `/v2/` via the registry core
 * (`listRegistryTags`, `resolveManifest`). `resolveManifest`'s
 * `registryPath` parameter remains a bare `string` (see the module's own
 * report on why it was not tightened to {@link RegistryPath}) — a
 * `RegistryPath` is structurally a `string`, so it is passed straight
 * through with no cast needed.
 *
 * `listTags` throws on anything other than a clean `"success"` from
 * {@link listRegistryTags}, since {@link RegistryReader.listTags} has no
 * failure channel of its own — the ONLY caller, {@link buildLiveRoots},
 * resolves every tag immediately afterwards anyway, so a tag-listing
 * failure and a tag-resolution failure end up in the same fail-closed
 * path either way. This adapter is the one exception where "throw" is
 * appropriate: it is a boundary-crossing detail of wiring GHCR-shaped
 * errors into a Promise, not a semantic decision belonging to the pure
 * planning core.
 */
function createRegistryReader(getToken) {
    return {
        async listTags(path) {
            const token = await getToken(path);
            const result = await listRegistryTags(path, token);
            if (result.status !== "success") {
                throw new Error(`failed to list tags for ${path}: ${result.status}`);
            }
            return result.tags.map((t) => tag(t));
        },
        async resolve(path, ref) {
            const token = await getToken(path);
            return resolveManifest(path, token, ref);
        },
    };
}
/** The real {@link PackagesClient}: the Packages API via `registry/packages.ts`, branding the raw shape into {@link PackageVersionRecord}. */
function createPackagesClient(octokit) {
    return {
        async listVersions(org, pkg) {
            const raws = await listPackageVersions(octokit, org, pkg);
            return raws.map((v) => ({
                id: v.id,
                digest: digest(v.digest),
                createdAt: new Date(v.createdAt),
                reportedTags: v.tags.map((t) => tag(t)),
            }));
        },
    };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/limiter.ts
/**
 * A bounded concurrency gate: `limit(fn)` queues `fn` and runs it only
 * once fewer than `limit` calls are currently in flight through THIS
 * limiter. Unlike a fixed-size worker pool over a known array (see
 * `cli.ts`'s `runPool`), this has no notion of "items" — arbitrary,
 * differently-shaped async work from anywhere can share one limiter.
 *
 * This is what actually bounds registry HTTP concurrency for ghcr-tidy
 * (see `cli.ts`'s `--jobs` wiring): the planning core (`roots.ts`,
 * `reachability.ts`) fires its independent per-tag/per-BFS-node requests
 * with `Promise.all` and no limit of its own — deliberately, so it stays
 * pure set-arithmetic-plus-I/O with no concurrency policy baked in — and
 * relies on the `RegistryReader` it was given already being wrapped by a
 * limiter sized to `--jobs`. One shared limiter, applied once at the
 * registry-adapter boundary, means concurrency stays additive (bounded by
 * `--jobs` HTTP requests in flight at any moment, across every package and
 * every BFS frontier at once) rather than multiplying together with
 * whatever other pool (e.g. the cross-package one) happens to also be
 * live — two independently-sized pools nested inside each other would
 * bound total concurrency to their PRODUCT, not either one's own limit.
 */
function createLimiter(limit) {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`limiter concurrency must be a positive integer, got ${String(limit)}`);
    }
    let active = 0;
    const queue = [];
    function schedule() {
        if (active >= limit) {
            return;
        }
        const run = queue.shift();
        if (!run) {
            return;
        }
        active += 1;
        run();
    }
    return function withLimit(fn) {
        return new Promise((resolve, reject) => {
            queue.push(() => {
                fn().then((value) => {
                    active -= 1;
                    resolve(value);
                    schedule();
                }, (error) => {
                    active -= 1;
                    reject(error);
                    schedule();
                });
            });
            schedule();
        });
    };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/resolve-cache.ts
/**
 * Decorates a {@link RegistryReader} so that within one run, the same
 * `(path, ref)` pair is never sent to the underlying registry twice — and
 * two callers racing on the SAME digest (e.g. two keep-roots whose BFS
 * frontiers both reach a shared platform manifest in the same tick, now
 * that `reachability.ts` resolves a frontier level concurrently) share one
 * in-flight request instead of issuing duplicates.
 *
 * Keyed on the raw reference actually sent to the registry (a {@link Tag}
 * or a {@link Digest}), not on the digest a resolution turns OUT to be:
 * resolving a tag is exactly the tag -> digest lookup itself, so it can
 * never be skipped just because some other tag happens to already be
 * known to point at the same digest. What this DOES eliminate is the
 * common case this model produces constantly: the same DIGEST reached
 * from more than one place — a child shared by several roots (already
 * partly handled by `reachability.ts`'s own `reachable`/`rootChildren`
 * bookkeeping) or a manifest fetched once as a BFS child and later found
 * again as an unrelated live root.
 *
 * Scoped per `path` implicitly (the key includes it), so it is safe to
 * share ONE cache across every package in a run: a digest is
 * content-addressed, but manifest storage in GHCR is per-repository, so a
 * digest resolved successfully under one package's path says nothing
 * about whether it exists under a different package's path.
 *
 * Does not cache `listTags` — the tag list is read exactly once per
 * package already (`roots.ts` is `buildLiveRoots`'s only caller besides
 * `verify.ts`'s snapshotting, and those are different logical reads at
 * different times), so there is nothing to de-duplicate there.
 */
function createCachingRegistryReader(registry) {
    const cache = new Map();
    function cachedResolve(path, ref) {
        const key = `${path}\u0000${ref}`;
        const existing = cache.get(key);
        if (existing !== undefined) {
            return existing;
        }
        const promise = registry.resolve(path, ref);
        cache.set(key, promise);
        return promise;
    }
    return {
        listTags: (path) => registry.listTags(path),
        resolve: cachedResolve,
    };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/mutator.ts

/**
 * A `Mutator` that HOLDS NO CLIENT — there is nothing inside it capable
 * of making an HTTP request, so it cannot reach the network even by
 * accident or by a future refactor that forgets to check a flag. It
 * records every call it would have made and always reports the
 * optimistic outcome (`"deleted"`), so a dry run's `calls` list and a
 * real apply run's journal (`journal.ts`) are directly diffable: both
 * enumerate the exact same intended mutations in the exact same order.
 */
function dryRunMutator() {
    const calls = [];
    const mutator = {
        deleteVersion(pkg, id) {
            calls.push({ kind: "deleteVersion", packageName: pkg, versionId: id });
            return Promise.resolve("deleted");
        },
        deletePackage(pkg) {
            calls.push({ kind: "deletePackage", packageName: pkg });
            return Promise.resolve("deleted");
        },
    };
    return { mutator, calls };
}
/**
 * The real, network-backed `Mutator`, wrapping `registry/packages.ts`.
 * REQUIRES an {@link ApplyCapability} as a constructor parameter, and
 * there is no other constructor for a network-backed `Mutator` — so
 * "delete without a durable, re-readable plan" (see `grantApply`'s doc)
 * is a type error, not a code-review item. See
 * `mutator.typecheck.ts` for the compile-time assertion that this
 * cannot be bypassed.
 *
 * `_cap` is intentionally unused at runtime: its only job is to exist in
 * the type signature.
 */
function applyMutator(octokit, org, _cap) {
    return {
        deleteVersion: (pkg, id) => deletePackageVersion(octokit, org, pkg, id),
        deletePackage: (pkg) => deletePackage(octokit, org, pkg),
    };
}

;// CONCATENATED MODULE: external "node:crypto"
const external_node_crypto_namespaceObject = __WEBPACK_EXTERNAL_createRequire(import.meta.url)("node:crypto");
;// CONCATENATED MODULE: ./ghcr-tidy/src/persisted-plan.ts


/**
 * The apply path's durable, on-disk artifact — deliberately a NARROWER
 * shape than the planning core's `PackagePlanResult`: digest + numeric
 * Packages API version id only, nothing about *why* a digest was
 * selected (no reachability sets, no policy). This is what makes the
 * schema small, stable, and easy to validate strictly (see {@link parsePlan}):
 * a plan file is a list of things to delete and the ids needed to delete
 * them, not a serialisation of the planning core's internal state.
 */
const PLAN_SCHEMA_VERSION = 1;
/**
 * Builds a {@link PersistedPackagePlan} from a planning core `PlannedPlan`,
 * pairing every digest in its `groups` with the numeric version id
 * `applyMutator`'s `deleteVersion` requires (`plan.ts`'s
 * `versionIdByDigest`, an apply-only field the pure planning core
 * otherwise has no use for).
 */
function toPersistedPackagePlan(pkg, plan) {
    const resolve = (d) => {
        const versionId = plan.versionIdByDigest.get(d);
        if (versionId === undefined) {
            throw new Error(`no Packages API version id known for digest ${d} planned for deletion`);
        }
        return { digest: d, versionId };
    };
    return {
        packageName: pkg,
        groups: plan.groups.map((g) => ({
            root: resolve(g.root),
            members: g.members.map(resolve),
        })),
    };
}
/**
 * Deterministic, canonical serialisation: every field is re-emitted in a
 * FIXED order (never simply `JSON.stringify(plan)`, which would follow
 * whatever key insertion order the value happened to have), so the same
 * `Plan` value always produces the same bytes. `grantApply`'s hash-based
 * round-trip check depends on this: a plan that serialises differently
 * from one call to the next would make that check meaningless.
 */
function serializePlan(plan) {
    const canonical = {
        schemaVersion: plan.schemaVersion,
        org: plan.org,
        generatedAt: plan.generatedAt,
        packages: plan.packages.map((pkg) => ({
            packageName: pkg.packageName,
            groups: pkg.groups.map((g) => ({
                root: { digest: g.root.digest, versionId: g.root.versionId },
                members: g.members.map((m) => ({ digest: m.digest, versionId: m.versionId })),
            })),
        })),
    };
    return JSON.stringify(canonical, null, 2);
}
function fail(where, message) {
    throw new Error(`invalid plan at ${where}: ${message}`);
}
function persisted_plan_isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Rejects any field not in `allowed` — the "closed" half of "closed schema": an unrecognised field is as suspicious as a missing one. */
function assertNoExtraKeys(obj, allowed, where) {
    const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
    if (extra.length > 0) {
        fail(where, `unexpected field(s): ${extra.join(", ")}`);
    }
}
function parseMember(raw, where) {
    if (!persisted_plan_isPlainObject(raw))
        fail(where, "must be an object");
    assertNoExtraKeys(raw, ["digest", "versionId"], where);
    const rawDigest = raw.digest;
    const versionId = raw.versionId;
    if (typeof rawDigest !== "string")
        fail(`${where}.digest`, "must be a string");
    if (typeof versionId !== "number" || !Number.isInteger(versionId) || versionId < 0) {
        fail(`${where}.versionId`, "must be a non-negative integer");
    }
    let d;
    try {
        d = digest(rawDigest);
    }
    catch (error) {
        fail(`${where}.digest`, error instanceof Error ? error.message : String(error));
    }
    return { digest: d, versionId };
}
function parseGroup(raw, where) {
    if (!persisted_plan_isPlainObject(raw))
        fail(where, "must be an object");
    assertNoExtraKeys(raw, ["root", "members"], where);
    const root = parseMember(raw.root, `${where}.root`);
    if (!Array.isArray(raw.members))
        fail(`${where}.members`, "must be an array");
    const members = raw.members.map((m, i) => parseMember(m, `${where}.members[${String(i)}]`));
    if (members.length === 0 || members[0]?.digest !== root.digest) {
        fail(where, "members[0] must equal root (root-first ordering)");
    }
    return { root, members };
}
function parsePackagePlan(raw, where) {
    if (!persisted_plan_isPlainObject(raw))
        fail(where, "must be an object");
    assertNoExtraKeys(raw, ["packageName", "groups"], where);
    const rawName = raw.packageName;
    const groups = raw.groups;
    if (typeof rawName !== "string")
        fail(`${where}.packageName`, "must be a string");
    if (!Array.isArray(groups))
        fail(`${where}.groups`, "must be an array");
    let name;
    try {
        name = packageName(rawName);
    }
    catch (error) {
        fail(`${where}.packageName`, error instanceof Error ? error.message : String(error));
    }
    return {
        packageName: name,
        groups: groups.map((g, i) => parseGroup(g, `${where}.groups[${String(i)}]`)),
    };
}
/**
 * Parses and validates a persisted plan against a CLOSED schema: any
 * missing field, wrong type, or UNRECOGNISED extra field throws, and
 * every digest/package name is re-validated through its own branding
 * constructor (never trusted as already-valid just because the JSON
 * parsed). Deliberately strict rather than lenient: this is the last
 * check standing between an on-disk file and {@link grantApply} handing
 * out a capability to delete, and a schema that tolerates one
 * unrecognised field could just as easily tolerate a typo'd one.
 */
function parsePlan(raw) {
    if (!persisted_plan_isPlainObject(raw))
        fail("plan", "must be an object");
    assertNoExtraKeys(raw, ["schemaVersion", "org", "generatedAt", "packages"], "plan");
    const { schemaVersion, org, generatedAt, packages } = raw;
    if (schemaVersion !== PLAN_SCHEMA_VERSION) {
        fail("plan.schemaVersion", `must be ${String(PLAN_SCHEMA_VERSION)}, got ${JSON.stringify(schemaVersion)}`);
    }
    if (typeof org !== "string" || org.length === 0)
        fail("plan.org", "must be a non-empty string");
    if (typeof generatedAt !== "string" || Number.isNaN(Date.parse(generatedAt))) {
        fail("plan.generatedAt", "must be an ISO-8601 timestamp string");
    }
    if (!Array.isArray(packages))
        fail("plan.packages", "must be an array");
    return {
        schemaVersion: PLAN_SCHEMA_VERSION,
        org,
        generatedAt,
        packages: packages.map((p, i) => parsePackagePlan(p, `plan.packages[${String(i)}]`)),
    };
}
/**
 * Structural, plan-only sanity check: no digest may appear as a non-root
 * member of one group while also being the root of a DIFFERENT group in
 * the same package. The planning core's own construction
 * (`buildDeletionGroups`'s shared `visited` set) already guarantees this
 * for a plan built in the same process, but the persisted `Plan` schema
 * intentionally does not carry the full `reachable`/`edges` data
 * `assertNoSurvivingParent` (`deletion-group.ts`) needs to re-verify the
 * stronger "no surviving KEPT parent" property — that property was
 * already checked once, in-process, before this plan was ever persisted
 * (see `plan.ts`'s call to `assertNoSurvivingParent`). This check is the
 * defense-in-depth re-verification available from the persisted shape
 * alone: it catches a hand-edited or corrupted plan file that merges or
 * duplicates group membership in a way that would make the apply path's
 * per-group abandonment semantics (`apply.ts`) incoherent.
 */
function assertGroupsAreWellFormed(plan) {
    for (const pkg of plan.packages) {
        const roots = new Set(pkg.groups.map((g) => g.root.digest));
        const seen = new Set();
        for (const group of pkg.groups) {
            for (const member of group.members) {
                if (seen.has(member.digest)) {
                    throw new Error(`plan integrity violation: digest ${member.digest} appears in more than one group of package ${pkg.packageName}`);
                }
                seen.add(member.digest);
                if (member.digest !== group.root.digest && roots.has(member.digest)) {
                    throw new Error(`plan integrity violation: digest ${member.digest} is both a non-root member of group ${group.root.digest} and the root of another group in package ${pkg.packageName}`);
                }
            }
        }
    }
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/apply-capability.ts




function nodePlanFileSystem() {
    return {
        mkdir: async (dirPath) => {
            await (0,promises_namespaceObject.mkdir)(dirPath, { recursive: true });
        },
        writeFile: (filePath, content) => (0,promises_namespaceObject.writeFile)(filePath, content, "utf8"),
        rename: (from, to) => (0,promises_namespaceObject.rename)(from, to),
        readFile: (filePath) => (0,promises_namespaceObject.readFile)(filePath, "utf8"),
    };
}
function sha256Hex(content) {
    return (0,external_node_crypto_namespaceObject.createHash)("sha256").update(content, "utf8").digest("hex");
}
/**
 * Grants an {@link ApplyCapability} for `plan`, but ONLY after:
 *
 * 1. Serialising it deterministically ({@link serializePlan}).
 * 2. Writing it atomically — a temp file in the SAME directory as
 *    `filePath`, then a rename, so `filePath` never briefly shows a
 *    partial write.
 * 3. Reading `filePath` back from disk (not reusing the in-memory
 *    `serialized` string — the read must exercise the real file).
 * 4. Verifying a SHA-256 hash of the reread bytes matches the bytes just
 *    serialised.
 * 5. Re-parsing the reread bytes against {@link parsePlan}'s closed
 *    schema and confirming the result matches `plan` exactly.
 *
 * Any failure at any step throws and no capability is returned — there
 * is no other constructor for one, and {@link applyMutator} in
 * `mutator.ts` requires one, so "delete without a durable, re-readable
 * plan" is a type error, not a code-review item.
 *
 * This exists to make one specific historical failure structurally
 * impossible: the bash reference serialised its plan with
 * `jq --argjson`, silently produced a ZERO-BYTE plan file once the plan
 * exceeded argv's ~128KB limit, logged success, and deleted anyway. Here
 * a truncated or corrupted write is caught before any mutation can
 * occur, because obtaining the capability IS the round trip.
 */
async function grantApply(plan, filePath, fs = nodePlanFileSystem()) {
    const serialized = serializePlan(plan);
    const expectedHash = sha256Hex(serialized);
    const dir = external_node_path_default().dirname(filePath);
    await fs.mkdir(dir);
    const tmpPath = external_node_path_default().join(dir, `.${external_node_path_default().basename(filePath)}.tmp-${(0,external_node_crypto_namespaceObject.randomBytes)(8).toString("hex")}`);
    await fs.writeFile(tmpPath, serialized);
    await fs.rename(tmpPath, filePath);
    const reread = await fs.readFile(filePath);
    const actualHash = sha256Hex(reread);
    if (actualHash !== expectedHash) {
        throw new Error(`plan round trip failed: content hash of ${filePath} after write (${actualHash}) does not match the hash of what was serialised (${expectedHash}) — refusing to grant apply`);
    }
    let rawJson;
    try {
        rawJson = JSON.parse(reread);
    }
    catch (error) {
        throw new Error(`plan round trip failed: ${filePath} is not valid JSON after being written (${error instanceof Error ? error.message : String(error)}) — refusing to grant apply`);
    }
    // Compare via serializePlan's canonical key order, not raw
    // JSON.stringify — a value's own key insertion order is not guaranteed
    // to match parsePlan's, and this check must not produce a false
    // mismatch on two structurally-identical plans.
    const reparsed = parsePlan(rawJson);
    if (serializePlan(reparsed) !== serializePlan(plan)) {
        throw new Error(`plan round trip failed: the plan re-read from ${filePath} does not match the plan that was granted — refusing to grant apply`);
    }
    return {};
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/incident-report.ts
/**
 * Renders a {@link RegressionIncident} into the plain-text body of the
 * breaker issue. Written for a human reading it cold, with no other
 * context, at 3am: what broke, what this run did just before it broke,
 * where to find more detail, and — because GHCR deletions are
 * irreversible — what to do about it. Pure and synchronous: no I/O, no
 * knowledge of GitHub, Octokit, or the breaker itself.
 */
/**
 * GitHub's hard limit on an issue/comment body is 65536 characters —
 * kept comfortably under it rather than exactly at it, since this is
 * plain text with no reason to court the edge. This is the fix for the
 * incident that made it necessary: a single concurrent-publish burst on
 * one package (~40 tags repointed by someone else's CI mid-run)
 * produced a body over 65536 characters, GitHub's `POST .../issues`
 * rejected it outright ("Validation Failed: body is too long"), and the
 * breaker — the safety mechanism for a REAL regression — could not file
 * its own incident at the exact moment it mattered most.
 */
const MAX_INCIDENT_BODY_CHARS = 60_000;
/** Which of the three regression-predicate parts (see `verify.ts`'s `compareSnapshots`) is responsible for one tag's finding. Order matters: a tag that no longer resolves has nothing meaningful to say about its digest or closure, so that check comes first. */
function failedPredicatePart(t) {
    if (!t.stillResolves) {
        return "tag gone (no longer resolves)";
    }
    if (!t.digestUnchanged) {
        return "tag now resolves to a different digest";
    }
    if (!t.closureResolves) {
        return "manifest closure broken (a child manifest this tag's index points at no longer resolves)";
    }
    return "unknown (no predicate part reported as failed — this should not happen)";
}
function formatTag(t) {
    const before = t.digestBefore ?? "(none recorded)";
    const after = t.digestAfter ?? "(none — tag no longer resolves)";
    return [
        `  - ${t.tag}`,
        `      failed check:    ${failedPredicatePart(t)}`,
        `      digest before:   ${before}`,
        `      digest after:    ${after}`,
    ].join("\n");
}
function formatDeletion(m) {
    return `  - digest ${m.digest} (version id ${String(m.versionId)})`;
}
/** Renders every item in full — the untruncated path, byte-identical to this module's pre-truncation behaviour, used whenever the resulting body fits under {@link MAX_INCIDENT_BODY_CHARS} on the first attempt. */
function renderFull(items, render, emptyText) {
    return items.length === 0 ? emptyText : items.map(render).join("\n");
}
/**
 * Renders as many `render(item)` lines from `items` as fit in `budget`
 * characters (each joined by `"\n"`), appending a plain, explicit
 * omission notice — never silent — when any had to be left out. Used for
 * both the affected-tags and preceding-deletions sections so an incident
 * with thousands of findings still produces a postable body instead of
 * failing exactly when the operator needs the issue filed most.
 */
function renderTruncated(items, render, budget, emptyText, noun) {
    if (items.length === 0) {
        return emptyText;
    }
    const lines = [];
    let used = 0;
    for (const item of items) {
        const line = render(item);
        const addedLength = lines.length === 0 ? line.length : line.length + 1; // +1 for the joining "\n"
        if (used + addedLength > budget) {
            break;
        }
        lines.push(line);
        used += addedLength;
    }
    const omitted = items.length - lines.length;
    if (omitted > 0) {
        lines.push(`  ... and ${String(omitted)} more ${noun}${omitted === 1 ? "" : "s"} omitted here for ` +
            `length (${String(items.length)} total) — see the journal for the full list.`);
    }
    return lines.join("\n");
}
/** Assembles the full report body from its two variable-length sections — everything else is fixed text, shared by both the untruncated and truncated render paths. */
function assembleBody(incident, options, tagsSection, deletionsSection, truncationNotice) {
    const journalLine = options.journalPath
        ? `Journal file for this run: ${options.journalPath}`
        : "Journal file for this run: not recorded — check the run's own logs/artifacts for its journal path.";
    return [
        "ghcr-tidy detected a post-apply verification REGRESSION and stopped.",
        "",
        `Package:   ${incident.packageName}`,
        ...(truncationNotice ? ["", truncationNotice] : []),
        "",
        "Affected tags:",
        tagsSection,
        "",
        "Deletions this run made in this package before the regression was detected:",
        deletionsSection,
        "",
        journalLine,
        "",
        "GHCR HAS NO UNDELETE. Whatever this run deleted in this package cannot be",
        "restored by GitHub — the only remediation is to rebuild and republish the",
        "affected tag(s) above from source.",
        "",
        "To clear this breaker: first understand the cause (read the journal above",
        "and confirm what actually broke and why), THEN close this issue. Closing",
        "the issue is the only way to clear the breaker — there is no automatic",
        "reset and no override flag. ghcr-tidy will refuse to delete anything in",
        "any package, in any future run, for as long as this issue stays open.",
    ].join("\n");
}
const NO_DELETIONS_TEXT = "  (none — the regression was detected before this package deleted anything)";
/**
 * Renders the full incident report body, guaranteed to be no longer than
 * {@link MAX_INCIDENT_BODY_CHARS}. See this module's doc for the
 * intended reader and the information it deliberately always includes.
 *
 * The common case (the incident is small enough to render in full) is
 * tried first and returned as-is. Only when that would exceed the
 * limit does this fall back to a truncated render: the affected-tags
 * list — the most actionable content, what actually regressed — gets
 * the larger share of the remaining budget; the preceding-deletions
 * list (already fully recorded in the run's own journal) gets the
 * smaller share. Either list that had to be cut states PLAINLY that it
 * was truncated and exactly how many entries were left out — a
 * breaker that silently drops evidence to fit is exactly the kind of
 * blind spot post-apply verification exists to prevent.
 */
function formatIncidentReport(incident, options = {}) {
    const fullTags = renderFull(incident.tags, formatTag, "");
    const fullDeletions = renderFull(incident.precedingDeletions, formatDeletion, NO_DELETIONS_TEXT);
    const full = assembleBody(incident, options, fullTags, fullDeletions, undefined);
    if (full.length <= MAX_INCIDENT_BODY_CHARS) {
        return full;
    }
    const truncationNotice = "NOTE: this report was truncated because the full incident exceeds GitHub's " +
        "issue body size limit. Counts below are of what is SHOWN, not the full " +
        "incident — see each section's own omission notice for how much was left out.";
    // Fixed overhead (everything except the two variable-length sections)
    // measured with both sections empty, so the budget split below reacts
    // to the ACTUAL incident (package name length, journal path length,
    // etc.) rather than a guessed constant.
    const skeletonLength = assembleBody(incident, options, "", "", truncationNotice).length;
    const available = Math.max(MAX_INCIDENT_BODY_CHARS - skeletonLength, 0);
    // Tags first: they are what regressed, and are this report's whole
    // point. Deletions are already fully recorded in the journal
    // (`journalLine` above), so they get the smaller remainder.
    const tagsBudget = Math.floor(available * 0.7);
    const deletionsBudget = available - tagsBudget;
    const tagsSection = renderTruncated(incident.tags, formatTag, tagsBudget, "", "tag");
    const deletionsSection = renderTruncated(incident.precedingDeletions, formatDeletion, deletionsBudget, NO_DELETIONS_TEXT, "deletion");
    const truncated = assembleBody(incident, options, tagsSection, deletionsSection, truncationNotice);
    if (truncated.length <= MAX_INCIDENT_BODY_CHARS) {
        return truncated;
    }
    // Last-resort safety net for a pathological case (e.g. a package name
    // long enough on its own to blow the budget): a hard cut is worse than
    // no truncation notice placement, but it is still postable, which a
    // rejected-outright issue is not.
    const marker = "\n\n[... report truncated to fit GitHub's issue body size limit ...]";
    return truncated.slice(0, MAX_INCIDENT_BODY_CHARS - marker.length) + marker;
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/breaker.ts

/**
 * An in-memory {@link Breaker} for tests. `trips` is a live reference
 * recording every incident passed to `trip`, in order, regardless of
 * whether the breaker was already tripped. Once tripped (either via the
 * `initial` argument or a prior `trip` call), `isTripped` keeps
 * reporting the SAME tripped state forever — nothing in this function
 * ever clears it, matching the real breaker's no-reset contract.
 */
function memoryBreaker(initial = null) {
    let tripped = initial;
    const trips = [];
    const breaker = {
        isTripped: () => Promise.resolve(tripped),
        trip: (incident) => {
            trips.push(incident);
            tripped ??= { issueNumber: 1, issueUrl: "https://github.com/example/example/issues/1" };
            return Promise.resolve();
        },
    };
    return { breaker, trips };
}
/** Fixed, well-known title for the breaker issue — `isTripped`/`trip` locate it by this exact title (scoped further by {@link BREAKER_ISSUE_LABEL}), never by searching free text. */
const BREAKER_ISSUE_TITLE = "ghcr-tidy: deletion breaker tripped (post-apply verification found a regression)";
/** Label applied to the breaker issue so it can be located by an exact, indexed field rather than a title-text search (GitHub's issue search is eventually consistent; label filtering on the list endpoint is not). */
const BREAKER_ISSUE_LABEL = "ghcr-tidy-breaker";
function isRawIssueArray(data) {
    return (Array.isArray(data) &&
        data.every((d) => typeof d === "object" &&
            d !== null &&
            typeof d.number === "number" &&
            typeof d.html_url === "string"));
}
/** The HTTP status an Octokit `RequestError` carries — narrowed so a mis-scoped-token 404 can be told apart from any other failure without depending on `@octokit/request-error` directly. */
function requestErrorStatus(error) {
    const status = error?.status;
    return typeof status === "number" ? status : undefined;
}
/**
 * Wraps one `octokit.request` call so a bare 404 — GitHub's response to
 * an issues call made with a token that has no `repo`/`issues` scope,
 * indistinguishable on the wire from "no such repo" — is rethrown with
 * the cause named. This is the fix for the incident that motivated it: a
 * PAT scoped `read:packages, delete:packages, read:org` (correct for
 * deleting GHCR versions, wrong for managing issues) produced exactly
 * this 404 with no indication anywhere that the token, not the repo, was
 * the problem — see this module's `githubIssueBreaker` doc for the token
 * this function expects to be handed instead.
 */
async function requestOrExplain(octokit, owner, repo, route, params) {
    try {
        return await octokit.request(route, params);
    }
    catch (error) {
        if (requestErrorStatus(error) === 404) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`ghcr-tidy breaker: GitHub returned 404 managing the breaker issue in ${owner}/${repo} ` +
                `(${route}). This almost always means the token passed to githubIssueBreaker cannot ` +
                `write issues — e.g. a delete:packages-scoped PAT used to delete GHCR versions has no ` +
                `repo/issues access. Configure a SEPARATE token with issue write access for the ` +
                `breaker (a plain GITHUB_TOKEN with \`issues: write\` permissions is enough). ` +
                `Original error: ${message}`);
        }
        throw error;
    }
}
/**
 * The real, GitHub-issue-backed {@link Breaker}.
 *
 * `isTripped` and `trip` both locate the breaker issue by listing OPEN
 * issues labelled {@link BREAKER_ISSUE_LABEL} — an exact, indexed match,
 * not a title-text search. `trip` creates that issue if none is open, or
 * adds a comment to the existing one if the breaker was somehow already
 * tripped when a second regression is reported (e.g. two packages in the
 * same run, or a re-run before a human has caught up) — either way the
 * issue stays open and no new issue is created for the same outage.
 *
 * `octokit` must be authenticated with a token that can create/comment on
 * issues in `owner/repo` — NOT necessarily the same token used to read
 * the registry or delete package versions (`delete:packages` carries no
 * issues access at all). See {@link requestOrExplain} for what happens
 * when it is the wrong one.
 */
function githubIssueBreaker(octokit, owner, repo, options = {}) {
    async function findOpenIssue() {
        const res = await requestOrExplain(octokit, owner, repo, "GET /repos/{owner}/{repo}/issues", {
            owner,
            repo,
            state: "open",
            labels: BREAKER_ISSUE_LABEL,
            per_page: 100,
        });
        if (!isRawIssueArray(res.data)) {
            throw new Error("unexpected response shape listing issues for the ghcr-tidy breaker");
        }
        return res.data[0];
    }
    return {
        async isTripped() {
            const issue = await findOpenIssue();
            return issue ? { issueNumber: issue.number, issueUrl: issue.html_url } : null;
        },
        async trip(incident) {
            const body = formatIncidentReport(incident, options);
            const existing = await findOpenIssue();
            if (existing) {
                await requestOrExplain(octokit, owner, repo, "POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
                    owner,
                    repo,
                    issue_number: existing.number,
                    body: `Another regression was detected while this breaker was already tripped:\n\n${body}`,
                });
                return;
            }
            await requestOrExplain(octokit, owner, repo, "POST /repos/{owner}/{repo}/issues", {
                owner,
                repo,
                title: BREAKER_ISSUE_TITLE,
                body,
                labels: [BREAKER_ISSUE_LABEL],
            });
        },
    };
}
/**
 * The real backing for `verify.ts`'s `RegressionSink` seam: every
 * recorded incident trips the breaker. This is the ONLY thing that
 * connects post-apply verification to the breaker — `applyPlan` itself
 * never calls `trip` directly, it only checks `isTripped` (see
 * `apply.ts`). Wire this in as `VerificationOptions.sink` to make a
 * regression actually stop future runs, not merely this one.
 */
function breakerRegressionSink(breaker) {
    return {
        record: (incident) => breaker.trip(incident),
    };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/journal.ts

const systemClock = { now: () => new Date() };
/** The real `Journal`: appends one NDJSON line per call to `path`. Never truncates or rewrites — appending only, so a partially-written run's history is never lost by a later run. */
function ndjsonJournal(path, clock = systemClock) {
    async function append(entry) {
        await (0,promises_namespaceObject.appendFile)(path, `${JSON.stringify(entry)}\n`, "utf8");
    }
    return {
        recordIntent: (target) => append({ type: "intent", timestamp: clock.now().toISOString(), target }),
        recordOutcome: (target, outcome) => append({ type: "outcome", timestamp: clock.now().toISOString(), target, outcome }),
    };
}
/** An in-memory `Journal` for tests: records every entry, in order, with no filesystem I/O. `entries` is a live reference. */
function memoryJournal(clock = systemClock) {
    const entries = [];
    const journal = {
        recordIntent: (target) => {
            entries.push({ type: "intent", timestamp: clock.now().toISOString(), target });
            return Promise.resolve();
        },
        recordOutcome: (target, outcome) => {
            entries.push({ type: "outcome", timestamp: clock.now().toISOString(), target, outcome });
            return Promise.resolve();
        },
    };
    return { journal, entries };
}

// EXTERNAL MODULE: ./node_modules/yaml/dist/index.js
var dist = __nccwpck_require__(8815);
;// CONCATENATED MODULE: ./ghcr-tidy/src/manifest/schema.ts


/**
 * `.ghcr-tidy.yaml` config manifest schema (version 1): which packages
 * `ghcr-tidy` manages and, optionally, retention overrides for each.
 *
 * CLOSED schema: an unknown top-level or per-package field is a hard error,
 * never a silently-ignored one. A silently ignored key in a deletion tool's
 * config produces a green run that did the wrong thing — the exact failure
 * class this strictness exists to remove.
 *
 * `packages[].match` is a FULL package name (`registry/package-name.ts`'s
 * `PackageName`), never a `(prefix, image)` pair to be joined here or
 * anywhere else — see that module's doc for why: the two existing bash
 * implementations concatenate a repo prefix onto an image name in two
 * mutually incompatible ways, and that exact bug class is what the branded
 * `PackageName` type exists to make structurally impossible. A manifest
 * author who needs `baseimages/golang` writes exactly that string.
 */
/** `keepLast`/`keepDays`/`graceDays` default to 30/30/10-ish floors — see the per-field docs below for the exact defaults and, critically, why `keepDays` and `graceDays` are two separate knobs that must not be conflated. */
const DEFAULT_KEEP_LAST = 10;
/** `keepDays` protects TAGGED ROOTS (via `retain.ts`'s `RetentionPolicy`) — a root younger than this is kept regardless of tag or count. Deliberately equal to {@link DEFAULT_GRACE_DAYS} and not to be diverged from casually: both are a 30-day floor agreed for this project: lowering either deletes inside it. */
const DEFAULT_KEEP_DAYS = 30;
/** `graceDays` protects EVERY version regardless of tags (`plan.ts`'s `INFLIGHT`) — a digest pushed by a build that has not yet been tagged. See {@link DEFAULT_KEEP_DAYS}'s doc for why this is a separate knob from `keepDays`, both defaulting to the same 30-day floor. */
const DEFAULT_GRACE_DAYS = 30;
/** Tags matching any of these patterns are protected (digest-scoped — see `retain.ts`), and so is every other tag sharing that digest. */
const DEFAULT_PROTECTED_TAGS = ["^latest$", "^alpine$", "^debian$"];
/** `policy: "cache"` (see {@link ManifestPackageEntry.policy}) keeps every LIVE (tagged) root unconditionally — implemented as a protected-tag pattern matching every tag, so `retain.ts`'s existing digest-scoped protection logic does the work with no special-cased branch of its own. */
const CACHE_POLICY_PATTERN = "^.*$";
/** A manifest failed structural validation. Carries the location (a dotted/bracketed path) where it failed. */
class ManifestError extends Error {
    location;
    /** The underlying failure message, without the location prefix. */
    reason;
    constructor(reason, location) {
        super(location ? `${location}: ${reason}` : reason);
        this.location = location;
        this.name = "ManifestError";
        this.reason = reason;
    }
}
function schema_isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function schema_fail(location, message) {
    throw new ManifestError(message, location);
}
function checkUnknownFields(obj, allowed, location) {
    for (const key of Object.keys(obj)) {
        if (!allowed.includes(key)) {
            schema_fail(location, `unknown field "${key}" (allowed: ${allowed.join(", ")})`);
        }
    }
}
function validateNonNegativeInt(value, field, location) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        schema_fail(`${location}.${field}`, `"${field}" must be a non-negative integer`);
    }
}
function validateProtectedTags(value, location) {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
        schema_fail(location, `"protectedTags" must be an array of strings`);
    }
    for (const pattern of value) {
        try {
            new RegExp(pattern);
        }
        catch (error) {
            schema_fail(location, `"protectedTags" entry ${JSON.stringify(pattern)} is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return value;
}
const PACKAGE_ENTRY_FIELDS = [
    "match",
    "policy",
    "keepLast",
    "keepDays",
    "graceDays",
    "protectedTags",
];
function validatePackageEntry(raw, location, seenMatches) {
    if (!schema_isPlainObject(raw)) {
        schema_fail(location, "package entry must be an object");
    }
    checkUnknownFields(raw, PACKAGE_ENTRY_FIELDS, location);
    if (typeof raw.match !== "string" || raw.match.length === 0) {
        schema_fail(`${location}.match`, `"match" must be a non-empty string`);
    }
    let match;
    try {
        match = packageName(raw.match);
    }
    catch (error) {
        schema_fail(`${location}.match`, error instanceof Error ? error.message : String(error));
    }
    if (seenMatches.has(match)) {
        schema_fail(`${location}.match`, `duplicate package "${match}" — each package may be listed once`);
    }
    seenMatches.add(match);
    if (raw.policy !== undefined && raw.policy !== "cache") {
        schema_fail(`${location}.policy`, `"policy" must be "cache" if present, got ${JSON.stringify(raw.policy)}`);
    }
    if (raw.keepLast !== undefined) {
        validateNonNegativeInt(raw.keepLast, "keepLast", location);
    }
    if (raw.keepDays !== undefined) {
        validateNonNegativeInt(raw.keepDays, "keepDays", location);
    }
    if (raw.graceDays !== undefined) {
        validateNonNegativeInt(raw.graceDays, "graceDays", location);
    }
    let protectedTags;
    if (raw.protectedTags !== undefined) {
        protectedTags = validateProtectedTags(raw.protectedTags, `${location}.protectedTags`);
    }
    return {
        match,
        ...(raw.policy !== undefined && { policy: raw.policy }),
        ...(raw.keepLast !== undefined && { keepLast: raw.keepLast }),
        ...(raw.keepDays !== undefined && { keepDays: raw.keepDays }),
        ...(raw.graceDays !== undefined && { graceDays: raw.graceDays }),
        ...(protectedTags !== undefined && { protectedTags }),
    };
}
const CANARY_FIELDS = ["package", "tag"];
function validateCanary(raw, location) {
    if (!schema_isPlainObject(raw)) {
        schema_fail(location, `"canary" must be an object with "package" and "tag"`);
    }
    checkUnknownFields(raw, CANARY_FIELDS, location);
    if (typeof raw.package !== "string" || raw.package.length === 0) {
        schema_fail(`${location}.package`, `"package" must be a non-empty string`);
    }
    let pkg;
    try {
        pkg = packageName(raw.package);
    }
    catch (error) {
        schema_fail(`${location}.package`, error instanceof Error ? error.message : String(error));
    }
    if (typeof raw.tag !== "string" || raw.tag.length === 0) {
        schema_fail(`${location}.tag`, `"tag" must be a non-empty string`);
    }
    let canaryTag;
    try {
        canaryTag = tag(raw.tag);
    }
    catch (error) {
        schema_fail(`${location}.tag`, error instanceof Error ? error.message : String(error));
    }
    return { package: pkg, tag: canaryTag };
}
const MANIFEST_TOP_LEVEL_FIELDS = [
    "version",
    "owner",
    "packages",
    "keepLast",
    "keepDays",
    "graceDays",
    "protectedTags",
    "canary",
];
/**
 * Validates a manifest already parsed from YAML into a plain JS value
 * (`unknown`). Pure — no I/O, no network.
 *
 * Rejects: any unrecognised top-level or per-package field (including
 * under `canary`); a missing or non-`1` `version`; a missing/empty
 * `owner`; a duplicate `match` across `packages`; a `match` (or
 * `canary.package`) that is not a syntactically valid {@link PackageName};
 * an empty/missing `canary.tag`; and a malformed `protectedTags` regex
 * anywhere. Does NOT reject an empty `packages` array — see
 * {@link Manifest.packages}'s doc for why. Does NOT reject a missing
 * `canary` — see {@link Manifest.canary}'s doc for why that is optional
 * rather than required.
 */
function validateManifest(raw) {
    if (!schema_isPlainObject(raw)) {
        schema_fail("<root>", "manifest must be an object");
    }
    checkUnknownFields(raw, MANIFEST_TOP_LEVEL_FIELDS, "<root>");
    if (raw.version !== 1) {
        schema_fail("version", `manifest "version" must be 1, got ${JSON.stringify(raw.version)}`);
    }
    if (typeof raw.owner !== "string" || raw.owner.length === 0) {
        schema_fail("owner", `"owner" must be a non-empty string`);
    }
    if (raw.packages === undefined) {
        schema_fail("packages", `manifest must have a "packages" field (an array, possibly empty)`);
    }
    if (!Array.isArray(raw.packages)) {
        schema_fail("packages", `"packages" must be an array`);
    }
    const seenMatches = new Set();
    const packages = raw.packages.map((entry, idx) => validatePackageEntry(entry, `packages[${String(idx)}]`, seenMatches));
    if (raw.keepLast !== undefined) {
        validateNonNegativeInt(raw.keepLast, "keepLast", "<root>");
    }
    if (raw.keepDays !== undefined) {
        validateNonNegativeInt(raw.keepDays, "keepDays", "<root>");
    }
    if (raw.graceDays !== undefined) {
        validateNonNegativeInt(raw.graceDays, "graceDays", "<root>");
    }
    let protectedTags;
    if (raw.protectedTags !== undefined) {
        protectedTags = validateProtectedTags(raw.protectedTags, "protectedTags");
    }
    let canary;
    if (raw.canary !== undefined) {
        canary = validateCanary(raw.canary, "canary");
    }
    return {
        version: 1,
        owner: raw.owner,
        packages,
        ...(raw.keepLast !== undefined && { keepLast: raw.keepLast }),
        ...(raw.keepDays !== undefined && { keepDays: raw.keepDays }),
        ...(raw.graceDays !== undefined && { graceDays: raw.graceDays }),
        ...(protectedTags !== undefined && { protectedTags }),
        ...(canary !== undefined && { canary }),
    };
}
/**
 * Resolves `entry`'s effective retention policy: per-package override,
 * falling back to the manifest-level override, falling back to the
 * hardcoded default — in that order, field by field.
 *
 * `policy: "cache"` short-circuits `protectedTagPatterns` to
 * {@link CACHE_POLICY_PATTERN} (every tag is protected, hence every live
 * root is a keep-root) and makes `keepLast`/`keepDays`/`protectedTags`
 * moot for THIS package — they are not read at all, rather than read and
 * then overridden, so a manifest author who sets both `policy: "cache"`
 * and e.g. `keepLast: 3` on the same entry does not get a confusing
 * silent precedence rule to memorise; `keepLast` there is simply inert.
 * `graceDays` is resolved and applied identically regardless of `policy`
 * — it protects untagged children, an orthogonal concern from root
 * retention (see `retain.ts`'s `RetentionPolicy` doc).
 */
function resolvePolicy(entry, manifest) {
    const graceDays = entry.graceDays ?? manifest.graceDays ?? DEFAULT_GRACE_DAYS;
    if (entry.policy === "cache") {
        return {
            protectedTagPatterns: [new RegExp(CACHE_POLICY_PATTERN)],
            keepLast: 0,
            keepDays: 0,
            graceDays,
        };
    }
    const protectedTagsRaw = entry.protectedTags ?? manifest.protectedTags ?? DEFAULT_PROTECTED_TAGS;
    return {
        protectedTagPatterns: protectedTagsRaw.map((p) => new RegExp(p)),
        keepLast: entry.keepLast ?? manifest.keepLast ?? DEFAULT_KEEP_LAST,
        keepDays: entry.keepDays ?? manifest.keepDays ?? DEFAULT_KEEP_DAYS,
        graceDays,
    };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/manifest/parse.ts


/**
 * Parses `.ghcr-tidy.yaml` from raw YAML text into a validated
 * {@link Manifest}. `sourcePath` is used only for error messages. A YAML
 * syntax error and a schema violation are both surfaced as the same
 * catchable {@link ManifestError}, naming the manifest file either way.
 */
function parseManifest(content, sourcePath) {
    let raw;
    try {
        raw = (0,dist/* parse */.qg)(content);
    }
    catch (error) {
        const reason = error instanceof dist/* YAMLParseError */.XT ? error.message : String(error);
        throw new ManifestError(`invalid YAML: ${reason}`, sourcePath);
    }
    try {
        return validateManifest(raw);
    }
    catch (error) {
        if (error instanceof ManifestError) {
            const location = error.location ? `${sourcePath}#${error.location}` : sourcePath;
            throw new ManifestError(error.reason, location);
        }
        throw error;
    }
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/retain.ts
const MS_PER_DAY = 86_400_000;
function isProtectedByTag(tags, patterns) {
    if (patterns.length === 0) {
        return false;
    }
    for (const t of tags) {
        if (patterns.some((p) => p.test(t))) {
            return true;
        }
    }
    return false;
}
/**
 * Age in days of a root, from the matching `PackageVersionRecord`, or
 * `undefined` if the root's digest has no matching entry in the Packages
 * API listing (e.g. a digest pushed so recently that API is not yet
 * consistent). Age `undefined` is NOT the same as age `0`: see
 * {@link isRetainedByAge}.
 */
function ageDaysOf(d, versionsByDigest, now) {
    const v = versionsByDigest.get(d);
    if (!v) {
        return undefined;
    }
    return (now.getTime() - v.createdAt.getTime()) / MS_PER_DAY;
}
/**
 * A root whose age cannot be determined (no matching Packages API entry)
 * is retained unconditionally. This is the fail-safe choice, not an
 * oversight: an unknown age might mean "younger than keepDays", and
 * treating unknown as "old enough to prune" would delete a digest we have
 * no evidence is safe to delete.
 */
function isRetainedByAge(ageDays, keepDays) {
    return ageDays === undefined || ageDays < keepDays;
}
/**
 * `KEEP_ROOTS = { d in LIVE_ROOTS : retain(d) }`.
 *
 * `retain(d)` is true if ANY of: `d` carries a protected tag (digest-scoped
 * — protecting the digest `latest` points at protects every other tag on
 * that same digest, by construction, since {@link LiveRoot.tags} is
 * already the full set of tags sharing that digest), `d` is among the
 * newest `keepLast` roots by creation time, or `d` is younger than
 * `keepDays` (see {@link isRetainedByAge} for the unknown-age case).
 *
 * Deterministic: same input roots + versions + policy + now always
 * produces the same keep set, because the newest-N ranking uses a stable
 * sort and set iteration order in this module never depends on insertion
 * from an external, non-deterministic source (the ordering that reaches
 * this function is the caller's business; this function iterates strictly
 * in the order given).
 */
function computeKeepRoots(roots, versionsByDigest, policy, now) {
    const keep = new Set();
    for (const root of roots) {
        if (isProtectedByTag(root.tags, policy.protectedTagPatterns)) {
            keep.add(root.digest);
        }
    }
    const knownAge = roots
        .map((root) => ({ root, createdAt: versionsByDigest.get(root.digest)?.createdAt }))
        .filter((entry) => entry.createdAt !== undefined)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    for (const { root } of knownAge.slice(0, Math.max(0, policy.keepLast))) {
        keep.add(root.digest);
    }
    for (const root of roots) {
        if (isRetainedByAge(ageDaysOf(root.digest, versionsByDigest, now), policy.keepDays)) {
            keep.add(root.digest);
        }
    }
    return keep;
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/skip-reason.ts
/** Maps a non-`"success"` {@link ManifestResolution} to the {@link SkipReason} it represents. */
function skipReasonFor(resolution) {
    switch (resolution.status) {
        case "success":
            return undefined;
        case "not-found":
            return "not-found";
        case "transient-error":
        case "client-error":
        case "network-error":
            return "transient";
    }
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/roots.ts


/**
 * Builds `LIVE_ROOTS = image(TAGMAP)` by listing the registry's own tags
 * and resolving each one — NEVER by reading the Packages API's per-version
 * `tags` array.
 *
 * This is the single most important departure from the bash reference,
 * which rooted on the Packages API instead (`tidy.sh:1068`) despite its
 * own sibling `audit.sh` documenting that array as a stale secondary index
 * "observed claiming a tag that, per the registry itself, resolves to a
 * different, healthy digest". A version whose `tags` array is stale-empty
 * while a registry tag genuinely points at it would, under that model,
 * not be a root, not be reachable, and get deleted along with its
 * children — precisely how `flutter-rfw`'s image was hollowed out.
 * Rooting in the registry closes that class of bug by construction: if a
 * tag resolves to a digest, that digest is live, full stop, regardless of
 * what the Packages API's cache says.
 *
 * Every tag must resolve for `LIVE_ROOTS` (and therefore `KEEP_ROOTS`) to
 * be computable at all, so this function fails the WHOLE package closed
 * (see the `plan.ts` module doc) on the first tag that does not resolve
 * with a `"success"` status — there is no smaller safe unit than "we do
 * not know what this tag points at". Listing the tags in the first place
 * is held to the same standard: {@link RegistryReader.listTags} has no
 * failure channel of its own (it throws — see `adapters.ts`'s doc), and a
 * thrown listing failure is caught here and turned into the identical
 * `"failed"` outcome, so a package whose tag list cannot even be read is
 * SKIPPED like any other fail-closed package, never left to propagate an
 * uncaught exception out of the whole run (that used to abort the entire
 * `plan`/`apply` invocation over ONE package's transient registry error,
 * while sibling packages already in flight kept running to completion in
 * the background regardless — see `cli.ts`'s `--jobs` doc for why that
 * mattered in practice).
 *
 * Every tag is resolved CONCURRENTLY (`Promise.all`) rather than one at a
 * time — this function itself imposes no concurrency limit; the
 * `RegistryReader` it is given is expected to already bound real HTTP
 * concurrency (see `limiter.ts`/`resolve-cache.ts` and `cli.ts`'s
 * `--jobs` wiring). Results are kept indexed by the tag list's own order
 * so that, if more than one tag fails, the FIRST one in list order is
 * always what gets reported — independent of which network round trip
 * happens to finish first — keeping the emitted skip reason
 * deterministic regardless of concurrency (see `plan.test.ts`'s
 * determinism-under-concurrency test).
 */
async function buildLiveRoots(path, registry) {
    let tags;
    try {
        tags = await registry.listTags(path);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { status: "failed", reason: "transient", detail: `failed to list tags: ${message}` };
    }
    const resolutions = await Promise.all(tags.map((t) => registry.resolve(path, t)));
    const tagsByDigest = new Map();
    const rootChildren = new Map();
    for (const [i, t] of tags.entries()) {
        const resolution = resolutions[i];
        // Always defined: `resolutions` was built from `tags` via `.map`, so
        // it has exactly `tags.length` entries in the same order.
        if (resolution === undefined) {
            throw new Error("unreachable: resolutions and tags must be the same length");
        }
        const reason = skipReasonFor(resolution);
        if (reason !== undefined) {
            return { status: "failed", reason, detail: `tag "${t}" failed to resolve` };
        }
        if (resolution.status !== "success") {
            // Unreachable: skipReasonFor returns undefined only for "success".
            throw new Error("unreachable: non-success resolution without a skip reason");
        }
        const d = digest(resolution.digest);
        const existing = tagsByDigest.get(d);
        if (existing) {
            existing.add(t);
        }
        else {
            tagsByDigest.set(d, new Set([t]));
        }
        if (!rootChildren.has(d)) {
            rootChildren.set(d, resolution.children.map((c) => digest(c.digest)));
        }
    }
    const roots = [...tagsByDigest.entries()].map(([d, tagSet]) => ({
        digest: d,
        tags: tagSet,
    }));
    return { status: "success", roots, rootChildren };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/reachability.ts


/**
 * `REACHABLE = least fixed point R with KEEP_ROOTS subset R and, for all
 * d in R, CHILDREN(d) subset R`.
 *
 * Walks EVERY keep-root's subtree CONCURRENTLY — one BFS per root, all
 * started together via `Promise.all` — over a SHARED `reachable` set (so
 * a digest shared by two keep-roots is resolved once, whichever root's
 * walk gets there first). This replaced a per-root `for` loop that walked
 * one root's whole subtree to completion before starting the next: for a
 * package with many kept roots but a shallow tree under each (a few
 * children per multi-arch index), the old loop left most of `--jobs`'
 * concurrency budget idle, since only one root's handful of in-flight
 * requests ever competed for it at once. Firing every root's walk at once
 * does not add a second concurrency budget — see the note on the shared
 * limiter below — it just gives the one existing budget enough
 * simultaneous candidate work to actually fill it. (For a package that
 * keeps only a HANDFUL of roots — e.g. `keepLast: 1` — this walk was
 * never the dominant cost in the first place; see `deletion-group.ts`'s
 * `buildDeletionGroups`/`collectGroupMembers`, which walks the far larger
 * DELETE set and remains sequential root-by-root AND node-by-node, for
 * where that time actually goes.) One broken root does not stop the walk
 * of the others before the fail-closed check below is reached (though the
 * net effect here is the same: any failure fails the whole package
 * closed, per `plan.ts`'s module doc).
 *
 * `rootChildren` (from {@link buildLiveRoots}) supplies each root's direct
 * children for free — resolving a tag already fetched them — so the first
 * BFS level never re-resolves a root's own manifest.
 *
 * On any non-`"success"` resolution the WHOLE package must be treated as
 * fail-closed (see `plan.ts`): the caller cannot know `CHILDREN` of the
 * failed digest, so it cannot know whether anything downstream of it is
 * reachable. The distinct root/failedDigest in the result exists purely
 * for diagnostics.
 *
 * Each BFS level (the current `frontier`, de-duplicated) is ALSO resolved
 * concurrently (`Promise.all`), not one node at a time — this is usually
 * where most of a package's fan-out actually lives (a multi-arch index's
 * platform + attestation children, all siblings in one level). Like
 * `roots.ts`'s per-tag resolution, this function imposes no concurrency
 * limit of its own — real HTTP concurrency, across every root's every
 * level at once, is bounded entirely by the shared `RegistryReader`
 * (`limiter.ts`, `cli.ts`'s `--jobs`) applied once at the registry-adapter
 * boundary, so root-level and level-level fan-out here never multiply
 * together into a second, uncoordinated budget. Levels within one root
 * stay sequential (a node's children are only knowable once the node
 * itself has resolved); de-duplication against the shared `reachable` set
 * is exactly as it was before, just checked once per level up front
 * instead of node-by-node as each resolve returns, so concurrent
 * siblings — whether in the same root's level or in a different root's
 * walk entirely — never race each other into resolving the same digest
 * twice (JS's single-threaded, run-to-completion semantics make each
 * level's synchronous de-dup-and-reserve pass atomic; see `walkRoot`'s
 * own comment below).
 *
 * When more than one node fails — whether siblings in one level or nodes
 * in different roots' walks — the FIRST one in `keepRoots`' root order,
 * and within a root the first in that level's (de-duplicated,
 * order-preserving) frontier order, is always what gets reported:
 * `Promise.all` collects every root's outcome before any is inspected,
 * and outcomes are then scanned in root order, never by which network
 * round trip happens to finish first — so the emitted skip reason stays
 * deterministic regardless of concurrency (see `plan.test.ts`'s
 * determinism-under-concurrency test).
 */
async function computeReachability(path, keepRoots, rootChildren, registry, options = {}) {
    const nodeCap = options.nodeCap ?? 10_000;
    const depthCap = options.depthCap ?? 64;
    const reachable = new Set();
    const edges = new Map();
    // One root's BFS. Runs concurrently with every other root's (see
    // `Promise.all` below) but reads/writes the OUTER `reachable`/`edges`
    // safely: JS is single-threaded and every mutation here happens in a
    // synchronous stretch with no `await` in between, so two roots' walks
    // can never interleave mid-check — each de-dup-and-reserve pass over a
    // level's frontier still completes atomically before this walk yields
    // to the next `await`, exactly as it did when levels were the only
    // thing resolved concurrently.
    async function walkRoot(root) {
        if (reachable.has(root)) {
            return { status: "success" };
        }
        let frontier = [root];
        let depth = 0;
        while (frontier.length > 0) {
            if (depth > depthCap) {
                throw new Error(`reachability walk rooted at ${root} exceeded the depth cap (${String(depthCap)})`);
            }
            // De-duplicate the level up front (a digest can appear more than
            // once in one frontier — e.g. two parents at the same level sharing
            // a child, or two DIFFERENT roots' frontiers converging on the same
            // shared descendant) so concurrent resolution below never issues
            // two requests for the same digest, and order is preserved for
            // deterministic failure reporting.
            const distinctFrontier = [];
            const seenThisLevel = new Set();
            for (const d of frontier) {
                if (reachable.has(d) || seenThisLevel.has(d)) {
                    continue;
                }
                seenThisLevel.add(d);
                distinctFrontier.push(d);
            }
            for (const d of distinctFrontier) {
                if (reachable.size >= nodeCap) {
                    throw new Error(`reachability walk exceeded the node cap (${String(nodeCap)})`);
                }
                // Reserved up front (before any resolve completes, and before
                // this walk's next `await`) so the node cap above is checked
                // against an accurate count even though the resolves below run
                // concurrently — both within this level and across sibling
                // roots' own levels.
                reachable.add(d);
            }
            const resolved = await Promise.all(distinctFrontier.map(async (d) => {
                const known = rootChildren.get(d);
                if (known !== undefined) {
                    return { kind: "known", children: known };
                }
                return { kind: "resolved", resolution: await registry.resolve(path, d) };
            }));
            const next = [];
            for (const [i, d] of distinctFrontier.entries()) {
                const outcome = resolved[i];
                // Always defined: `resolved` was built from `distinctFrontier`
                // via `.map`, so it has exactly `distinctFrontier.length` entries
                // in the same order.
                if (outcome === undefined) {
                    throw new Error("unreachable: resolved and distinctFrontier must be the same length");
                }
                let children;
                if (outcome.kind === "known") {
                    children = outcome.children;
                }
                else {
                    const reason = skipReasonFor(outcome.resolution);
                    if (reason !== undefined) {
                        return { status: "failed", reason, root, failedDigest: d };
                    }
                    if (outcome.resolution.status !== "success") {
                        throw new Error("unreachable: non-success resolution without a skip reason");
                    }
                    children = outcome.resolution.children.map((c) => digest(c.digest));
                }
                edges.set(d, children);
                next.push(...children);
            }
            frontier = next;
            depth++;
        }
        return { status: "success" };
    }
    // Every root's BFS is kicked off together — this is the fix for the
    // planner's bottleneck (see the module doc above): a keep-set with
    // hundreds of roots but only ~4 children per multi-arch index used to
    // leave almost all of `--jobs`' budget idle, because only ONE root's
    // handful of concurrent requests was ever in flight at a time. Real HTTP
    // concurrency is still bounded exactly as before — by the shared
    // `RegistryReader`'s own limiter (`limiter.ts`, `cli.ts`'s `--jobs`) at
    // the registry-adapter boundary, applied to every resolve this function
    // (and every OTHER root's) issues — so firing all roots' walks at once
    // does not add a second, uncoordinated concurrency budget: it simply
    // gives the one existing budget enough simultaneous candidate work to
    // actually fill it.
    //
    // Outcomes are collected via `Promise.all` (not raced) and then scanned
    // in `keepRoots`' OWN order below, so which failure gets reported is
    // determined purely by root order, never by which root's network calls
    // happen to finish first — the same determinism guarantee the
    // per-level frontier resolution already gave within a single root, now
    // extended across roots too.
    const outcomes = await Promise.all([...keepRoots].map((root) => walkRoot(root)));
    for (const outcome of outcomes) {
        if (outcome.status === "failed") {
            return outcome;
        }
    }
    return { status: "success", reachable, edges };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/deletion-group.ts

/**
 * Best-effort BFS over `deleteSet`-only nodes rooted at `root`, computing
 * `root`'s FULL transitive closure within `deleteSet` — as if `root` were
 * the only candidate, with no cross-candidate ownership to respect. Used
 * as {@link buildDeletionGroups}'s phase 1 (see that function's doc): the
 * closure computed here is candidate-LOCAL (only `localVisited`, scoped
 * to this one call, guards against re-visiting a node reachable two ways
 * within `root`'s own subtree — e.g. a diamond), so it can safely run
 * CONCURRENTLY with every other candidate's closure. Ownership — which
 * candidate actually gets to keep a digest reachable from more than
 * one — is resolved afterward, deterministically, by
 * {@link buildDeletionGroups} itself; this function neither knows nor
 * cares about it.
 *
 * Each BFS level's children are resolved CONCURRENTLY (`Promise.all`),
 * matching `reachability.ts`'s own per-level fan-out; like that function,
 * this imposes no concurrency limit of its own — real HTTP concurrency is
 * bounded entirely by the shared `RegistryReader` (`limiter.ts`, `cli.ts`'s
 * `--jobs`), and a digest reachable from more than one candidate is only
 * ever fetched once regardless (`resolve-cache.ts`, shared across the
 * whole run).
 *
 * This walk is REPORTING/GROUPING ONLY and never influences `DELETE`
 * itself (`DELETE` is pure set arithmetic — see `plan.ts`). Consequently a
 * failed or 404 resolution here must NOT fail the plan closed: a deleted
 * root's child that itself 404s is exactly the "stale Packages API entry"
 * case the design accepts into `DELETE` without ceremony. Resolution here
 * simply stops descending past whatever could not be resolved; the
 * digest is still in the group as a childless leaf (or, if unresolved
 * itself with no known parent, as its own singleton group root). A
 * genuinely UNEXPECTED failure (a bug, not a modeled 404/transient
 * response) still propagates as a rejected promise out of this function —
 * it is never silently swallowed into a truncated-but-plausible-looking
 * member list — which fails the whole package closed at the `planPackage`
 * level (`cli.ts`'s per-package isolation keeps that from touching any
 * OTHER package's plan).
 */
async function computeCandidateClosure(path, root, deleteSet, rootChildren, registry) {
    const localVisited = new Set([root]);
    const members = [root];
    let frontier = [root];
    while (frontier.length > 0) {
        const resolved = await Promise.all(frontier.map(async (d) => {
            const known = rootChildren.get(d);
            if (known !== undefined) {
                return known;
            }
            try {
                const resolution = await registry.resolve(path, d);
                return resolution.status === "success"
                    ? resolution.children.map((c) => digest(c.digest))
                    : [];
            }
            catch {
                return [];
            }
        }));
        const next = [];
        for (const children of resolved) {
            for (const c of children) {
                if (deleteSet.has(c) && !localVisited.has(c)) {
                    localVisited.add(c);
                    members.push(c);
                    next.push(c);
                }
            }
        }
        frontier = next;
    }
    return members;
}
/**
 * Groups `deleteSet` into {@link DeletionGroup}s, one per former live root
 * (parents ordered first) plus one singleton group per orphaned digest
 * that was never any known root's descendant.
 *
 * Two phases:
 *
 * 1. **Concurrent, side-effect-free**: every candidate root's FULL
 *    transitive closure within `deleteSet` is computed independently and
 *    at the same time ({@link computeCandidateClosure}, fired via
 *    `Promise.all`). This replaced a `for` loop that walked one
 *    candidate's whole subtree to completion — resolving one digest at a
 *    time — before starting the next: with hundreds of candidates (every
 *    deleted image is its own candidate), that left almost all of
 *    `--jobs`' concurrency budget idle for the same reason
 *    `reachability.ts`'s old per-root loop did. Real HTTP concurrency is
 *    still bounded entirely by the shared `RegistryReader`'s limiter, so
 *    firing every candidate's closure at once does not add a second,
 *    competing budget.
 * 2. **Deterministic, synchronous, no I/O**: candidates are walked in
 *    FIXED order (sorted digest order, live-root candidates first,
 *    exactly as before) and each one's precomputed closure is filtered
 *    against a single shared `visited` set, claiming whichever digests
 *    are not already owned by an earlier candidate. A digest reachable
 *    from more than one candidate's closure — the ownership race phase 1
 *    deliberately ignores — is always won by whichever candidate comes
 *    FIRST in this fixed order, exactly matching what the original
 *    sequential-BFS algorithm did (the first candidate to reach a shared
 *    digest always fully expanded into its descendants before any later
 *    candidate got a chance to). Because this phase does no I/O and never
 *    awaits, it can never race: the outcome depends only on candidate
 *    order, never on which candidate's network calls happened to resolve
 *    first — so the emitted groups (root, member order, and ownership of
 *    every shared digest) are byte-for-byte deterministic regardless of
 *    concurrency.
 *
 * Within a kept group, member order matches `computeCandidateClosure`'s
 * own BFS order (parents before children) with any digest claimed by an
 * earlier candidate filtered out — filtering out entries never reorders
 * the survivors, so parents still precede their children.
 */
async function buildDeletionGroups(path, deleteSet, liveRootDigests, rootChildren, registry) {
    const liveRootCandidates = [...deleteSet].filter((d) => liveRootDigests.has(d)).sort();
    const otherCandidates = [...deleteSet].filter((d) => !liveRootDigests.has(d)).sort();
    const orderedCandidates = [...liveRootCandidates, ...otherCandidates];
    const closures = await Promise.all(orderedCandidates.map((root) => computeCandidateClosure(path, root, deleteSet, rootChildren, registry)));
    const visited = new Set();
    const groups = [];
    for (const [i, root] of orderedCandidates.entries()) {
        if (visited.has(root)) {
            continue;
        }
        const closure = closures[i];
        // Always defined: `closures` was built from `orderedCandidates` via
        // `.map`, so it has exactly `orderedCandidates.length` entries in the
        // same order.
        if (closure === undefined) {
            throw new Error("unreachable: closures and orderedCandidates must be the same length");
        }
        const members = [];
        for (const d of closure) {
            if (visited.has(d)) {
                continue;
            }
            visited.add(d);
            members.push(d);
        }
        groups.push({ root, members });
    }
    return groups;
}
/**
 * Static integrity assertion: no digest in `DELETE` may still be
 * referenced as a child of a digest in `reachable` (a "surviving parent").
 * `edges` here should be the reachability walk's own edge map — every
 * digest it contains as a key was successfully resolved, so its recorded
 * children are exactly what the registry itself reports.
 *
 * Throws on violation. Intended to run once per planned package as the
 * final sanity check before a plan is returned to the caller.
 */
function assertNoSurvivingParent(deleteSet, reachable, edges) {
    for (const [parent, children] of edges) {
        if (!reachable.has(parent)) {
            continue;
        }
        for (const child of children) {
            if (deleteSet.has(child)) {
                throw new Error(`plan integrity violation: ${child} is planned for deletion but reachable parent ${parent} still references it`);
            }
        }
    }
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/plan.ts





const plan_MS_PER_DAY = 86_400_000;
/**
 * Wraps {@link computeReachability} to optionally tolerate a keep-root
 * whose subtree contains a PROVEN not-found descendant (a confirmed
 * registry 404 — see `skip-reason.ts`'s `"not-found"`; NEVER a
 * transient/5xx/auth/network failure, which always fails closed exactly
 * as `computeReachability` already does on its own — that distinction is
 * `skipReasonFor`'s whole reason for existing, and this function leans on
 * it rather than re-deriving anything).
 *
 * When `deleteBrokenRoots` is `false` (the default everywhere except the
 * explicit `--delete-broken-roots` CLI opt-in — see `cli.ts`), this is a
 * pure passthrough: exactly one `computeReachability` call, `brokenRoots`
 * always empty, byte-identical to calling `computeReachability` directly.
 *
 * When `true`: on a `"not-found"` failure, the FAILING ROOT ITSELF
 * (`result.root` — never a broader guess, never the `failedDigest` that
 * may be several levels below it) is removed from the keep-root set and
 * the ENTIRE walk is retried from scratch over the reduced set — each
 * retry starts with fresh `reachable`/`edges` state (a brand-new
 * `computeReachability` call), so a root excluded on one iteration can
 * never leave partially-resolved data behind to contaminate a later
 * iteration's result. This repeats until either every remaining root's
 * subtree resolves cleanly (`"success"`, with every excluded root
 * reported in `brokenRoots`) or a failure that does not qualify (any
 * `"transient"` reason, or `deleteBrokenRoots` itself being `false`) is
 * hit — at which point the WHOLE package still fails closed exactly as it
 * always has: a broken root already found on an earlier iteration never
 * gets "half credit" while something else remains genuinely unknown, so
 * this function only ever returns `brokenRoots` alongside a `"success"`
 * result, never alongside a `"failed"` one.
 *
 * An excluded root is not force-added to `DELETE` here or anywhere else:
 * it is simply no longer a keep-root, so `planPackage`'s ordinary
 * `ALL \ (REACHABLE union INFLIGHT)` set subtraction picks it up exactly
 * like any other digest that is not reachable from anything — including
 * still respecting `graceDays`, on the chance a "broken" root is actually
 * an in-flight push race (the index pushed, its child not yet) rather
 * than settled corruption.
 */
async function computeReachabilityToleratingBrokenRoots(path, keepRoots, rootChildren, registry, reachabilityOptions, deleteBrokenRoots) {
    let candidateRoots = keepRoots;
    const brokenRoots = new Set();
    for (;;) {
        const result = await computeReachability(path, candidateRoots, rootChildren, registry, reachabilityOptions);
        if (result.status === "success") {
            return { result, brokenRoots };
        }
        // Not "success": either the mode is off, the failure is not a proven
        // not-found (transient — never tolerated regardless of the flag), or
        // — defensively, should be unreachable in practice since
        // `computeReachability` only ever reports a root drawn from the set
        // it was given — the reported root is not even one still under
        // consideration. Any of these fails the whole package closed, same
        // as calling `computeReachability` directly, and any roots already
        // excluded on an earlier iteration are discarded (see this
        // function's doc: no "half credit").
        if (!deleteBrokenRoots || result.reason !== "not-found" || !candidateRoots.has(result.root)) {
            return { result, brokenRoots: new Set() };
        }
        brokenRoots.add(result.root);
        const next = new Set(candidateRoots);
        next.delete(result.root);
        candidateRoots = next;
    }
}
function mergeEdges(a, b) {
    const merged = new Map(a);
    for (const [k, v] of b) {
        merged.set(k, v);
    }
    return merged;
}
/**
 * Plans a single package. Implements, in order:
 *
 * ```
 * ALL         = Packages API versions (id, digest, createdAt) — version ids and ages ONLY
 * LIVE_ROOTS  = image(TAGMAP), from the REGISTRY tag list (never the Packages API's `tags`)
 * KEEP_ROOTS  = { d in LIVE_ROOTS : retain(d) }
 * REACHABLE   = least fixed point containing KEEP_ROOTS, closed under CHILDREN
 * INFLIGHT    = { v in ALL : age(v) < graceDays }
 * DELETE      = ALL \ (REACHABLE union INFLIGHT)
 * ```
 *
 * FAIL-CLOSED: if any keep-root or any of its descendants fails to
 * resolve, the WHOLE package is skipped — see {@link buildLiveRoots} and
 * {@link computeReachability} for why there is no smaller safe unit. Note
 * this is stricter than it sounds for `LIVE_ROOTS`: computing `KEEP_ROOTS`
 * at all requires knowing every live root's digest, which requires every
 * tag to resolve, so in practice ANY tag failing to resolve already fails
 * the package closed — not only tags that would end up kept.
 *
 * A digest that is in `ALL`, 404s in the registry, and is unreachable
 * from any kept root is deliberately NOT a fail-closed condition: it is
 * simply never resolved (nothing walks to it), and correctly falls into
 * `DELETE` via the set subtraction above — a stale Packages API entry,
 * not evidence of corruption.
 */
async function planPackage(options) {
    const { org, registryOwner, packageName, registry, packages, clock, policy } = options;
    const path = registryPathFor(registryOwner, packageName);
    const versions = await packages.listVersions(org, packageName);
    if (versions.length === 0) {
        return { status: "nothing-to-do" };
    }
    const versionsByDigest = new Map(versions.map((v) => [v.digest, v]));
    const liveRootsResult = await buildLiveRoots(path, registry);
    if (liveRootsResult.status === "failed") {
        return {
            status: "skipped",
            reason: liveRootsResult.reason,
            detail: liveRootsResult.detail,
        };
    }
    const { roots, rootChildren } = liveRootsResult;
    const now = clock.now();
    const keepRoots = computeKeepRoots(roots, versionsByDigest, policy.retention, now);
    const { result: reachResult, brokenRoots } = await computeReachabilityToleratingBrokenRoots(path, keepRoots, rootChildren, registry, options.reachability, options.deleteBrokenRoots ?? false);
    if (reachResult.status === "failed") {
        return {
            status: "skipped",
            reason: reachResult.reason,
            detail: `descendant ${reachResult.failedDigest} of root ${reachResult.root} failed to resolve`,
        };
    }
    const { reachable, edges } = reachResult;
    const inflight = new Set();
    for (const v of versions) {
        const ageDays = (now.getTime() - v.createdAt.getTime()) / plan_MS_PER_DAY;
        if (ageDays < policy.graceDays) {
            inflight.add(v.digest);
        }
    }
    const deleteSet = new Set();
    for (const v of versions) {
        if (!reachable.has(v.digest) && !inflight.has(v.digest)) {
            deleteSet.add(v.digest);
        }
    }
    if (deleteSet.size === 0) {
        return { status: "nothing-to-do" };
    }
    const liveRootDigests = new Set(roots.map((r) => r.digest));
    const groups = await buildDeletionGroups(path, deleteSet, liveRootDigests, mergeEdges(rootChildren, edges), registry);
    assertNoSurvivingParent(deleteSet, reachable, edges);
    const versionIdByDigest = new Map();
    for (const d of deleteSet) {
        const v = versionsByDigest.get(d);
        // Always present: deleteSet is built from `versions` itself above, so
        // every digest in it has a matching PackageVersionRecord by construction.
        if (v) {
            versionIdByDigest.set(d, v.id);
        }
    }
    return {
        status: "planned",
        total: versions.length,
        liveRootsCount: roots.length,
        keepRootsCount: keepRoots.size,
        reachableCount: reachable.size,
        inflightCount: inflight.size,
        deleteCount: deleteSet.size,
        groups,
        versionIdByDigest,
        brokenRootDigests: [...brokenRoots],
    };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/volume-alarm.ts
/**
 * A pure decision: should `applyPlan` refuse to run at all because the
 * plan is about to delete far more than usual?
 *
 * This is deliberately NOT the reference bash's `--max-delete-ratio`
 * (a ceiling on deletions as a fraction of total versions, capped at
 * 0.98). That model doesn't fit here: the reference's own comments admit
 * that repo routinely deletes 80-90% of versions in a normal run, so a
 * ratio ceiling can't distinguish "a normal aggressive prune" from "the
 * classifier is broken and is about to delete everything". A TRAILING
 * BASELINE can: it asks whether *this* run is unusual relative to
 * *this package's own recent history*, which is exactly the signal a
 * runaway reachability bug produces (a sudden multiple of what normally
 * gets deleted) without being tripped by routine steady-state churn.
 *
 * This module knows nothing about where the baseline comes from (a
 * journal, a metrics store, a flat file committed alongside the plan —
 * not this module's problem) or about GHCR, `Plan`, or any I/O. The
 * caller supplies the trailing baseline and the planned count; this
 * module only decides and explains why.
 */
/**
 * Default multiple applied to the trailing baseline before a plan is
 * refused.
 *
 * Justification: publish cadence and image count both vary week to
 * week, so some multiple above 1x is needed just to tolerate normal
 * variance (a burst of retagged/rebuilt images legitimately produces
 * more garbage than an average day). 3x is conservative enough to let
 * that kind of routine spike through untouched, while still catching
 * the failure mode this alarm exists for: a reachability/classification
 * bug that suddenly marks most or all of a package's digests as
 * unreachable, which produces a jump far larger than 3x a trailing
 * baseline, not a marginal one. There is no measured production
 * distribution to fit this to yet (unlike the reference tool's
 * documented 80-90% steady state, which this module deliberately does
 * NOT try to replicate — see the module doc); 3x is a starting point to
 * be tightened once real run history exists.
 */
const DEFAULT_VOLUME_ALARM_MULTIPLE = 3;
/**
 * Decides whether a plan deleting `plannedCount` versions should be
 * allowed to proceed.
 *
 * When `options.baseline` is `undefined` (no trailing history supplied —
 * e.g. the very first run, or a caller that hasn't wired history yet),
 * the decision is a DELIBERATE, DOCUMENTED `allowed: true`: refusing
 * every baseline-less run would make the alarm block indefinitely until
 * something seeds a baseline, which is worse than the risk it's meant to
 * catch. This is a deliberate choice, not an oversight — a caller that
 * wants a stricter posture for the no-history case must decide that
 * explicitly, e.g. by treating a missing baseline as `0` itself before
 * calling this function.
 */
function checkVolumeAlarm(plannedCount, options = {}) {
    const multiple = options.multiple ?? DEFAULT_VOLUME_ALARM_MULTIPLE;
    if (options.baseline === undefined) {
        return {
            allowed: true,
            plannedCount,
            multiple,
            reason: "no trailing baseline supplied — proceeding without a volume check " +
                "(deliberate default; see checkVolumeAlarm's doc)",
        };
    }
    const threshold = options.baseline * multiple;
    if (plannedCount > threshold) {
        return {
            allowed: false,
            plannedCount,
            baseline: options.baseline,
            multiple,
            threshold,
            reason: `planned deletions (${String(plannedCount)}) exceed ${String(multiple)}x the trailing ` +
                `baseline (${String(options.baseline)}, threshold ${String(threshold)})`,
        };
    }
    return {
        allowed: true,
        plannedCount,
        baseline: options.baseline,
        multiple,
        threshold,
        reason: `planned deletions (${String(plannedCount)}) are within ${String(multiple)}x the ` +
            `trailing baseline (${String(options.baseline)}, threshold ${String(threshold)})`,
    };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/verify.ts


async function closureState(path, d, registry, cache) {
    const cached = cache.get(d);
    if (cached !== undefined) {
        return cached;
    }
    const resolution = await registry.resolve(path, d);
    const reason = skipReasonFor(resolution);
    let state;
    if (reason === "not-found") {
        state = "not-found";
    }
    else if (reason === "transient") {
        state = "unknown";
    }
    else if (resolution.status === "success") {
        state = "resolved";
        for (const child of resolution.children) {
            const childState = await closureState(path, digest(child.digest), registry, cache);
            if (childState === "not-found") {
                state = "not-found";
                break;
            }
            if (childState === "unknown") {
                state = "unknown";
            }
        }
    }
    else {
        // Unreachable: skipReasonFor returns undefined only for "success".
        throw new Error("unreachable: non-success resolution without a skip reason");
    }
    cache.set(d, state);
    return state;
}
/** Resolves one tag and its full manifest closure. Shared by {@link snapshotPackage} (every tag of a package) and {@link checkCanary} (a single known-good tag, possibly in a different package). */
async function snapshotTag(path, t, registry, cache) {
    const resolution = await registry.resolve(path, t);
    const reason = skipReasonFor(resolution);
    if (reason === "not-found") {
        return { resolve: "not-found", closure: "unknown" };
    }
    if (reason === "transient") {
        return { resolve: "unknown", closure: "unknown" };
    }
    if (resolution.status !== "success") {
        throw new Error("unreachable: non-success resolution without a skip reason");
    }
    const d = digest(resolution.digest);
    // The tag's own resolution already gave us its direct children for
    // free (mirroring `roots.ts`'s `rootChildren` reuse) — no need to
    // re-resolve `d` itself, only walk what it points at.
    cache.set(d, "resolved");
    let closure = "resolved";
    for (const child of resolution.children) {
        const childState = await closureState(path, digest(child.digest), registry, cache);
        if (childState === "not-found") {
            closure = "not-found";
            break;
        }
        if (childState === "unknown") {
            closure = "unknown";
        }
    }
    return { resolve: "resolved", digest: d, closure };
}
/**
 * Snapshots every tag currently listed by the registry for `path`,
 * resolving each one and its full manifest closure. This is the ONLY
 * legitimate snapshot source for verification — see `roots.ts`'s module
 * doc on why ghcr-tidy never roots on anything but the registry's own tag
 * list. Snapshotting what the planner believed (its keep-roots) would
 * inherit whatever the planner got wrong; snapshotting the registry
 * itself does not.
 */
async function snapshotPackage(path, registry) {
    const tags = await registry.listTags(path);
    const cache = new Map();
    const result = new Map();
    for (const t of tags) {
        result.set(t, await snapshotTag(path, t, registry, cache));
    }
    return result;
}
/**
 * The pre-flight canary: resolves one known-good tag end to end (tag +
 * full closure) BEFORE the first deletion of the whole run. If this
 * fails, the read path is broken today, independent of anything this run
 * is about to delete — the run must not mistake a bad registry day for
 * damage it caused.
 *
 * Returns a {@link CanaryCheckResult} rather than a bare boolean so a
 * failure always carries its cause (see {@link CanaryFailureReason}) —
 * fail-closed behaviour is unchanged, only the diagnosis improves.
 */
async function checkCanary(path, canaryTag, registry) {
    let snapshot;
    try {
        snapshot = await snapshotTag(path, canaryTag, registry, new Map());
    }
    catch (error) {
        return {
            ok: false,
            reason: {
                kind: "error",
                message: error instanceof Error ? error.message : String(error),
            },
        };
    }
    if (snapshot.resolve !== "resolved") {
        return { ok: false, reason: { kind: "resolve-failed", state: snapshot.resolve } };
    }
    if (snapshot.closure !== "resolved") {
        return { ok: false, reason: { kind: "closure-failed", state: snapshot.closure } };
    }
    return { ok: true };
}
function isHealthy(s) {
    return s.resolve === "resolved" && s.closure === "resolved";
}
/** Confirmed broken by direct 404 evidence — NOT merely "unknown". */
function isConfirmedBroken(s) {
    return s.resolve === "not-found" || (s.resolve === "resolved" && s.closure === "not-found");
}
/** Neither confirmed healthy nor confirmed broken — a transient read failure occurred somewhere in this tag's resolution. */
function isUnknown(s) {
    return s.resolve === "unknown" || (s.resolve === "resolved" && s.closure === "unknown");
}
function toFinding(t, pre, post) {
    return {
        tag: t,
        digestBefore: pre.digest,
        digestAfter: post.digest,
        stillResolves: post.resolve === "resolved",
        digestUnchanged: pre.digest !== undefined && post.digest !== undefined && pre.digest === post.digest,
        closureResolves: post.closure === "resolved",
    };
}
/**
 * The three-part regression predicate. For every tag present in `pre`:
 *
 * 1. it must still resolve;
 * 2. its full child closure must still resolve;
 * 3. IF it still resolves and its closure still resolves, a digest
 *    change is `republished` (a concurrent publish), never a
 *    regression — see {@link CompareSnapshotsResult.republished}'s doc
 *    for why: deleting a manifest can only make a tag fail to resolve,
 *    it can never repoint a tag to a different digest, so a
 *    healthy-to-healthy digest change is never evidence THIS run
 *    caused damage.
 *
 * A tag confirmed broken in BOTH `pre` and `post` is reported separately
 * (`preExisting`) and does not count as a regression — a budgeted
 * multi-run drain of an already-broken package must not report the same
 * known damage as fresh every run. A tag whose pre-apply state could not
 * be confirmed either way (`"unknown"` — a transient read failure) is
 * held to the STRICT posture: any CONFIRMED-broken post state counts as
 * a regression, because there is no confirmed-broken pre state to excuse
 * it into `preExisting` — but a merely `"unknown"` post state still only
 * ever lands in `unverified`, never `regressions`, same as everywhere
 * else in this predicate.
 */
function compareSnapshots(pre, post, options = {}) {
    const postSnapshotFailed = options.postSnapshotFailed ?? false;
    function effectivePostState(t) {
        if (postSnapshotFailed) {
            // See `CompareSnapshotsOptions.postSnapshotFailed`'s doc: the read
            // itself failed, so `post` (however it looks) is not trustworthy
            // evidence for ANY tag — never fall through to the "absent means
            // not-found" default below, which is only valid when the post read
            // actually succeeded.
            return { resolve: "unknown", closure: "unknown" };
        }
        return post.get(t) ?? { resolve: "not-found", closure: "unknown" };
    }
    // When the PRE-snapshot itself failed there is no reliable baseline to
    // iterate (`pre` is empty) — instead walk every tag `post` currently
    // knows about, each with a synthetic `"unknown"` pre-state, so the
    // per-tag classification below still runs and still separates
    // confirmed damage from merely-unverifiable tags.
    const entries = options.preSnapshotFailed
        ? Array.from(post.keys(), (t) => [t, { resolve: "unknown", closure: "unknown" }])
        : pre;
    const regressions = [];
    const preExisting = [];
    const unverified = [];
    const republished = [];
    for (const [t, preState] of entries) {
        const postState = effectivePostState(t);
        if (isHealthy(preState)) {
            if (isHealthy(postState)) {
                if (preState.digest === postState.digest) {
                    continue;
                }
                // Still fully healthy — tag resolves, full closure resolves —
                // just pointing somewhere else. Deleting a manifest cannot
                // repoint a tag, only make it fail to resolve, so this is never
                // evidence that THIS run's deletions caused any damage: it is a
                // concurrent publish (someone else's CI) racing this run. See
                // `republished`'s doc for why this is its own bucket rather than
                // folded into `regressions` or `unverified`.
                republished.push(toFinding(t, preState, postState));
                continue;
            }
            if (isUnknown(postState)) {
                // Cannot confirm the tag is broken — only that this run's read of
                // it, post-apply, was inconclusive. Surfaced, but not a
                // regression: see this module's doc on why `isUnknown` must never
                // trip the breaker.
                unverified.push(toFinding(t, preState, postState));
            }
            else {
                // isConfirmedBroken(postState): either the tag itself now 404s,
                // or it still resolves but its closure does not — both are real,
                // confirmed damage regardless of any digest change, so neither
                // is ever redirected into `republished`.
                regressions.push(toFinding(t, preState, postState));
            }
            continue;
        }
        if (isUnknown(preState)) {
            if (isConfirmedBroken(postState)) {
                regressions.push(toFinding(t, preState, postState));
            }
            else if (isUnknown(postState)) {
                unverified.push(toFinding(t, preState, postState));
            }
            // Else: post state is healthy — resolved fine, nothing to report.
            // (There is no pre-apply digest to compare against here, so a
            // healthy post state can never be classified as `republished`
            // either — there is nothing to say it changed FROM.)
            continue;
        }
        // isConfirmedBroken(preState) must hold — isHealthy and isUnknown are exhaustive otherwise.
        if (isConfirmedBroken(postState)) {
            preExisting.push(toFinding(t, preState, postState));
        }
        else if (isUnknown(postState)) {
            unverified.push(toFinding(t, preState, postState));
        }
        // Else: improved (now resolves) — no confirmed new damage to act on.
    }
    return { regressions, preExisting, unverified, republished };
}
/** An in-memory `RegressionSink` for tests: records every incident, in order, with no I/O. `incidents` is a live reference. */
function memoryRegressionSink() {
    const incidents = [];
    const sink = {
        record: (incident) => {
            incidents.push(incident);
            return Promise.resolve();
        },
    };
    return { sink, incidents };
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/apply.ts




/** Total number of individual version deletions this plan would attempt across every package and group, budget permitting — what the volume alarm (`volume-alarm.ts`) compares against its baseline. */
function plannedDeletionCount(plan) {
    return plan.packages.reduce((sum, p) => sum + p.groups.reduce((s, g) => s + g.members.length, 0), 0);
}
function isSuccess(result) {
    return result === "deleted" || result === "already-gone";
}
/**
 * Executes ONE {@link PersistedDeletionGroup} against `mutator`, in
 * parents-first order, stopping at the first member whose delete does
 * not cleanly succeed.
 *
 * This is the structural fix for the defect that hollowed out
 * `flutter-rfw`: the hardened bash ordered tagged roots before their
 * (not directly tag-referenced) children but, on a failed ROOT delete,
 * merely logged and continued straight on to that root's children anyway
 * — leaving a tag resolving to an index whose children were all gone. Here, any
 * non-success on ANY member (root or descendant) immediately abandons
 * every member after it in the group's parents-first order; those
 * members are recorded `"not-attempted"` and no further calls are made
 * for this group. An abandoned group therefore leaves behind, at worst,
 * unreferenced garbage below whatever was deleted before the failure —
 * never a live tag whose children were deleted out from under it, since
 * the root is always `members[0]` and is always attempted first.
 *
 * `"already-gone"` (a 404) is treated exactly like success: the digest is
 * already absent, which is the desired end state, not a failure — this
 * is also what makes applying the same plan twice idempotent.
 */
async function applyGroup(pkg, group, mutator, journal, remainingBudget) {
    if (remainingBudget < group.members.length) {
        return {
            result: {
                root: group.root.digest,
                status: "skipped-budget",
                members: group.members.map((m) => ({
                    digest: m.digest,
                    versionId: m.versionId,
                    result: "not-attempted",
                })),
            },
            attempted: 0,
        };
    }
    const members = [];
    let attempted = 0;
    let abandoned = false;
    for (const member of group.members) {
        if (abandoned) {
            members.push({ digest: member.digest, versionId: member.versionId, result: "not-attempted" });
            continue;
        }
        const target = {
            packageName: pkg,
            versionId: member.versionId,
            digest: member.digest,
        };
        await journal?.recordIntent(target);
        attempted += 1;
        try {
            const outcome = await mutator.deleteVersion(pkg, member.versionId);
            await journal?.recordOutcome(target, { kind: outcome });
            if (isSuccess(outcome)) {
                members.push({ digest: member.digest, versionId: member.versionId, result: outcome });
            }
            else {
                // "last-version-conflict": a 400, GHCR's undocumented refusal to
                // delete a package's last remaining version via this endpoint
                // (see registry/packages.ts). Surfaced as-is, never retried
                // in a loop (that loop would never terminate) — just abandons
                // the rest of this group like any other non-success.
                members.push({
                    digest: member.digest,
                    versionId: member.versionId,
                    result: "last-version-conflict",
                    detail: "GHCR refuses to delete a package's last remaining version via this endpoint",
                });
                abandoned = true;
            }
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            await journal?.recordOutcome(target, { kind: "failed", error: detail });
            members.push({ digest: member.digest, versionId: member.versionId, result: "error", detail });
            abandoned = true;
        }
    }
    return {
        result: { root: group.root.digest, status: abandoned ? "abandoned" : "completed", members },
        attempted,
    };
}
/** Every member across `groups` that was actually deleted (success, including a 404-as-already-gone) — what {@link RegressionIncident.precedingDeletions} reports for a package. */
function deletedMembers(groups) {
    const out = [];
    for (const g of groups) {
        for (const m of g.members) {
            if (m.result === "deleted" || m.result === "already-gone") {
                out.push({ digest: m.digest, versionId: m.versionId });
            }
        }
    }
    return out;
}
/** Snapshots `path`, translating a thrown/rejected read (e.g. `listTags` itself failing) into the strict-posture `preSnapshotFailed` signal `compareSnapshots` needs, rather than letting it propagate and abort the run for a reason indistinguishable from a real regression. */
async function trySnapshot(path, registry) {
    try {
        return { snapshot: await snapshotPackage(path, registry), failed: false };
    }
    catch {
        return { snapshot: new Map(), failed: true };
    }
}
/**
 * Applies `plan` group by group, package by package, in the plan's own
 * order. Enforces {@link assertGroupsAreWellFormed} BEFORE any mutation —
 * throws (never mutates anything) on a structurally malformed plan, e.g.
 * one hand-edited after `grantApply` validated it.
 *
 * Budget accounting is GROUP-granular (see `ApplyOptions.budget`'s doc):
 * checked before a group starts, decremented by the number of members
 * actually ATTEMPTED once it finishes (which can be less than the
 * group's full size if it was abandoned partway through — the unspent
 * remainder is available to later groups).
 *
 * When `options.verification` is set: the pre-flight canary is resolved
 * once, before this function's very first deletion, and a canary failure
 * aborts before touching anything. Each package is then snapshotted from
 * the registry's own tag list immediately BEFORE its deletions begin and
 * again immediately AFTER they finish (interleaved, never batched to the
 * end of the run — see this module's and `verify.ts`'s docs for why: a
 * regression from an early package must not be masked by continuing to
 * apply a plan whose underlying model has just been shown to be wrong).
 * A regression aborts the WHOLE run before the next package is started;
 * every package already processed keeps its result, every package after
 * it is never touched.
 */
async function applyPlan(plan, mutator, options) {
    assertGroupsAreWellFormed(plan);
    if (options.breaker) {
        const tripped = await options.breaker.isTripped();
        if (tripped) {
            return {
                packages: [],
                attempted: 0,
                remainingBudget: options.budget,
                abortedFor: { kind: "breaker-tripped", state: tripped },
            };
        }
    }
    if (options.volumeAlarm) {
        const decision = checkVolumeAlarm(plannedDeletionCount(plan), options.volumeAlarm);
        if (!decision.allowed) {
            return {
                packages: [],
                attempted: 0,
                remainingBudget: options.budget,
                abortedFor: { kind: "volume-alarm", decision },
            };
        }
    }
    const verification = options.verification;
    if (verification) {
        const canaryResult = await checkCanary(verification.canary.path, verification.canary.tag, verification.registry);
        if (!canaryResult.ok) {
            return {
                packages: [],
                attempted: 0,
                remainingBudget: options.budget,
                abortedFor: {
                    kind: "canary-failed",
                    path: verification.canary.path,
                    tag: verification.canary.tag,
                    reason: canaryResult.reason,
                },
            };
        }
    }
    let remainingBudget = options.budget;
    let totalAttempted = 0;
    const packages = [];
    for (const pkgPlan of plan.packages) {
        let preSnapshot;
        let preSnapshotFailed = false;
        let registryPath;
        if (verification) {
            registryPath = registryPathFor(plan.org, pkgPlan.packageName);
            const pre = await trySnapshot(registryPath, verification.registry);
            preSnapshot = pre.snapshot;
            preSnapshotFailed = pre.failed;
        }
        const groups = [];
        for (const group of pkgPlan.groups) {
            const { result, attempted } = await applyGroup(pkgPlan.packageName, group, mutator, options.journal, remainingBudget);
            groups.push(result);
            remainingBudget -= attempted;
            totalAttempted += attempted;
        }
        // Computed BEFORE `packages.push` below (rather than three separate
        // pushes at each abort site) so `republishedTags` — genuinely useful
        // context, not damage — is present on this package's result exactly
        // once, in the same place, regardless of whether this package also
        // aborts the run.
        let republishedTags = [];
        let regressionToRecord;
        let abortReason;
        if (verification && registryPath) {
            // A post-snapshot read failure gets exactly the same "unknown"
            // treatment as any other unresolved tag (see `verify.ts`'s
            // `ResolveState` doc) rather than throwing: an infrastructure
            // hiccup reading the registry back is not evidence of a
            // regression, but it also cannot be silently waved through. Unlike
            // the pre-fix behaviour, `post.failed` is now THREADED into
            // `compareSnapshots` as `postSnapshotFailed` rather than silently
            // discarded — passing only `post.snapshot` (empty on failure) let
            // the ordinary "absent from post means confirmed not-found" rule
            // fire for every tag the pre-snapshot had ever seen healthy, which
            // is exactly what turned one failed `listTags` call into a mass
            // false regression on a real apply run.
            const post = await trySnapshot(registryPath, verification.registry);
            if (preSnapshotFailed && post.failed) {
                // Neither snapshot could be taken at all: there is no per-tag
                // data in either direction for this package, so there is
                // nothing for `compareSnapshots` to compare — bypass it rather
                // than let it silently report zero findings. This is NOT
                // evidence of a regression (nothing here is confirmed broken),
                // but the run must still stop and this must still be surfaced
                // loudly, same as any other `unverified` finding.
                abortReason = {
                    kind: "verification-unavailable",
                    packageName: pkgPlan.packageName,
                    tags: [],
                };
            }
            else {
                const { regressions, unverified, republished } = compareSnapshots(preSnapshot ?? new Map(), post.snapshot, {
                    preSnapshotFailed,
                    postSnapshotFailed: post.failed,
                });
                republishedTags = republished;
                if (regressions.length > 0) {
                    regressionToRecord = {
                        packageName: pkgPlan.packageName,
                        tags: regressions,
                        precedingDeletions: deletedMembers(groups),
                    };
                }
                else if (unverified.length > 0) {
                    abortReason = {
                        kind: "verification-unavailable",
                        packageName: pkgPlan.packageName,
                        tags: unverified,
                    };
                }
            }
        }
        packages.push({ packageName: pkgPlan.packageName, groups, republishedTags });
        if (regressionToRecord) {
            // Recorded locally BEFORE the sink (which may make network calls,
            // e.g. `breaker.ts`'s `githubIssueBreaker`) is even attempted —
            // see `VerificationOptions.onIncident`'s doc: this is what makes
            // the incident survive a breaker outage.
            verification?.onIncident?.(regressionToRecord);
            let sinkError;
            try {
                await verification?.sink.record(regressionToRecord);
            }
            catch (error) {
                // The regression is real and confirmed either way; a failure
                // notifying the breaker about it must not swallow the run's own
                // summary (see this module's doc on the incident this fixes) —
                // reported alongside the abort reason instead of propagating and
                // killing the whole process before the caller can print
                // anything.
                sinkError = error instanceof Error ? error.message : String(error);
            }
            return {
                packages,
                attempted: totalAttempted,
                remainingBudget,
                abortedFor: {
                    kind: "regression",
                    packageName: pkgPlan.packageName,
                    tags: regressionToRecord.tags,
                    ...(sinkError !== undefined && { sinkError }),
                },
            };
        }
        if (abortReason) {
            return { packages, attempted: totalAttempted, remainingBudget, abortedFor: abortReason };
        }
    }
    return { packages, attempted: totalAttempted, remainingBudget };
}
/** Total number of groups across every package in the plan — used by {@link classifyApplyExit} to distinguish "nothing to do" from "something was supposed to happen and didn't". */
function totalGroupCount(plan) {
    return plan.packages.reduce((sum, p) => sum + p.groups.length, 0);
}
const EXIT_APPLY_OK = 0;
const EXIT_APPLY_MUTATION_FAILURE = 1;
const EXIT_APPLY_SAFETY = 4;
/**
 * Maps an {@link ApplyResult} to an exit code, extending the planning
 * core's `0`/`1` scheme with `4 = safety`.
 *
 * The zero-mutation guard: if the plan contained at least one group but
 * NOTHING was attempted (e.g. the whole budget was `0`, or every group
 * was skipped for budget reasons), that is a FAILURE — a
 * non-empty plan silently doing nothing is exactly the kind of runner
 * malfunction `4` exists to flag loudly rather than let masquerade as
 * `0 = ok`. Distinguished from a normal `1 = mutation failure` (some
 * group was abandoned because the registry itself rejected a delete):
 * `4` means "the run itself did not do its job", `1` means "the run did
 * its job and the registry said no to part of it".
 *
 * `result.abortedFor` (a canary failure, or a post-apply regression) is
 * ALSO `4`, checked first: a regression can leave `result.attempted > 0`
 * (the aborting package's own deletions already happened), which would
 * otherwise fall through to the `1`/`0` logic below and understate what
 * went wrong — verification catching a wrong model is exactly the same
 * severity as the zero-mutation guard below it, not merely "some deletes
 * failed".
 */
function classifyApplyExit(plan, result) {
    if (result.abortedFor) {
        return EXIT_APPLY_SAFETY;
    }
    const groupCount = totalGroupCount(plan);
    if (groupCount > 0 && result.attempted === 0) {
        return EXIT_APPLY_SAFETY;
    }
    const hadAbandonedGroup = result.packages.some((p) => p.groups.some((g) => g.status === "abandoned"));
    return hadAbandonedGroup ? EXIT_APPLY_MUTATION_FAILURE : EXIT_APPLY_OK;
}

;// CONCATENATED MODULE: ./ghcr-tidy/src/cli.ts


















/**
 * `ghcr-tidy` — the CLI entrypoint wiring the pure planning core
 * (`plan.ts`), the apply path (`apply-capability.ts`, `apply.ts`,
 * `mutator.ts`), and safety machinery (`breaker.ts`, `volume-alarm.ts`,
 * `verify.ts`) into three subcommands driven by one config manifest,
 * `.ghcr-tidy.yaml`: closed-schema config, explicit argv parsing, a
 * small, total exit-code mapping, and the `INPUT_ARGS`-vs-argv duality
 * that lets this same bundle serve as both a plain CLI and (later) a JS
 * action.
 *
 * ## Exit codes
 *
 * A single, TOTAL mapping, reused unchanged by every subcommand:
 *
 * - `0` — ok. Nothing wrong; for `apply`, every attempted deletion
 *   succeeded (or there was nothing to do).
 * - `1` — FINDINGS: `plan` skipped at least one package fail-closed
 *   (`SkippedPlan`), or `apply` had at least one abandoned deletion group
 *   (the registry itself rejected part of a delete — see
 *   `apply.ts`'s `EXIT_APPLY_MUTATION_FAILURE`). The run itself worked;
 *   something it found or did was not clean.
 * - `2` — CONFIG: an invalid manifest, a CLI usage error, `--package`
 *   matching no configured package, or a required credential/flag missing
 *   (no `GITHUB_TOKEN`, `apply` requested with no `--apply` flag, no
 *   breaker configured for `apply`, no canary configured for an `apply`
 *   that has work to do).
 * - `3` — INFRASTRUCTURE: an unexpected error escaped the planning core
 *   or the apply path (a network failure, an auth failure, anything not
 *   already classified as a finding or a safety trip).
 * - `4` — SAFETY: the breaker was already tripped, the volume alarm
 *   refused the plan, the pre-flight canary failed, post-apply
 *   verification found a regression, or `apply.ts`'s own plan-integrity
 *   assertion threw — see `apply.ts`'s `EXIT_APPLY_SAFETY` for the
 *   zero-mutation guard this also covers.
 */
const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_CONFIG = 2;
const EXIT_INFRA = 3;
const EXIT_SAFETY = 4;
const DEFAULT_MANIFEST_PATH = ".ghcr-tidy.yaml";
/**
 * `--jobs`' default: ONE shared bound on real registry HTTP concurrency
 * for the whole run (see `limiter.ts`'s doc on why one shared limiter, not
 * one pool per dimension multiplied against another). It governs both how
 * many packages `runPlanning` processes at once (`runPool` below) AND,
 * via the same-sized limiter wrapped around the registry reader in
 * {@link buildRegistryAdapters}, how many per-tag/per-BFS-node requests
 * the planning core (`roots.ts`, `reachability.ts`) may have in flight at
 * once — across every package, not per package, so this stays the actual
 * ceiling on concurrent requests hitting `ghcr.io` regardless of how many
 * packages or BFS levels are logically "active" at once.
 *
 * 4: GHCR applies SECONDARY rate limits to bursts (see this project's
 * incident notes on `flutter-rfw`/`baseimages`), so
 * the fan-out this change adds within a single package (previously fully
 * serial: one HEAD per tag, one fetch per BFS node) must stay bounded
 * rather than firing every tag/every frontier node for every package at
 * once. `--jobs 1` recovers the fully serial behaviour this replaces.
 */
const DEFAULT_JOBS = 4;
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/** A CLI usage problem (bad flag, missing value, unrecognised subcommand) — always a CONFIG error. */
class UsageError extends Error {
    constructor(message) {
        super(message);
        this.name = "UsageError";
    }
}
/**
 * Parses argv (without `node`/script path). The first token is a
 * subcommand (`validate`/`plan`/`apply`) ONLY if it exactly matches one of
 * those three names; otherwise the whole of argv is treated as `plan`'s
 * flags — `plan` is the default subcommand since it is the read-only,
 * safe-to-run-with-no-ceremony operation.
 */
function parseArgv(argv) {
    let subcommand = "plan";
    let rest = argv;
    const first = argv[0];
    if (first === "validate" || first === "plan" || first === "apply") {
        subcommand = first;
        rest = argv.slice(1);
    }
    const args = { packages: [], apply: false, deleteBrokenRoots: false };
    let i = 0;
    while (i < rest.length) {
        const flag = rest[i];
        if (flag === undefined) {
            break;
        }
        i += 1;
        const nextValue = () => {
            const value = rest[i];
            if (value === undefined) {
                throw new UsageError(`missing value for ${flag}`);
            }
            i += 1;
            return value;
        };
        const nextPositiveInt = (name) => {
            const raw = nextValue();
            if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
                throw new UsageError(`${name} must be a positive integer, got "${raw}"`);
            }
            return Number(raw);
        };
        const nextNonNegativeInt = (name) => {
            const raw = nextValue();
            if (!/^\d+$/.test(raw)) {
                throw new UsageError(`${name} must be a non-negative integer, got "${raw}"`);
            }
            return Number(raw);
        };
        switch (flag) {
            case "--manifest":
                args.manifest = nextValue();
                break;
            case "--out":
                args.out = nextValue();
                break;
            case "--journal":
                args.journal = nextValue();
                break;
            case "--budget":
                args.budget = nextPositiveInt("--budget");
                break;
            case "--jobs":
                args.jobs = nextPositiveInt("--jobs");
                break;
            case "--package":
                args.packages.push(nextValue());
                break;
            case "--baseline":
                args.baseline = nextNonNegativeInt("--baseline");
                break;
            case "--canary-package":
                args.canaryPackage = nextValue();
                break;
            case "--canary-tag":
                args.canaryTag = nextValue();
                break;
            case "--registry-owner":
                args.registryOwner = nextValue();
                break;
            case "--breaker-repo":
                args.breakerRepo = nextValue();
                break;
            case "--breaker-token":
                args.breakerToken = nextValue();
                break;
            case "--apply":
                args.apply = true;
                break;
            case "--delete-broken-roots":
                args.deleteBrokenRoots = true;
                break;
            default:
                throw new UsageError(`unknown flag: ${flag}`);
        }
    }
    return { subcommand, args };
}
async function loadManifestFile(manifestFlag) {
    const manifestPath = external_node_path_default().resolve(manifestFlag ?? DEFAULT_MANIFEST_PATH);
    let content;
    try {
        content = await (0,promises_namespaceObject.readFile)(manifestPath, "utf8");
    }
    catch (error) {
        throw new ManifestError(`could not read manifest: ${errorMessage(error)}`, manifestPath);
    }
    return parseManifest(content, manifestPath);
}
/** Applies `--package` filtering: an exact match against each configured entry's `match`. Empty `filters` means "every configured package". Throws a {@link UsageError} (CONFIG) if a filter matches nothing. */
function selectPackages(manifest, filters) {
    if (filters.length === 0) {
        return manifest.packages;
    }
    const byName = new Map(manifest.packages.map((p) => [p.match, p]));
    const selected = [];
    for (const f of filters) {
        const entry = byName.get(f);
        if (!entry) {
            throw new UsageError(`--package "${f}" does not match any configured package (configured: ${manifest.packages
                .map((p) => p.match)
                .join(", ")})`);
        }
        selected.push(entry);
    }
    return selected;
}
/**
 * Runs `worker` over `items` with at most `limit` concurrently in flight,
 * writing each result to its original index — a small bounded pool. Not a
 * plain `Promise.all`: that would fire every item at once with no cap on
 * concurrent registry requests.
 */
async function runPool(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function runNext() {
        for (;;) {
            const i = nextIndex;
            nextIndex += 1;
            if (i >= items.length) {
                return;
            }
            const item = items[i];
            if (item === undefined) {
                continue;
            }
            results[i] = await worker(item, i);
        }
    }
    const workerCount = Math.min(limit, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => runNext()));
    return results;
}
const cli_systemClock = { now: () => new Date() };
function requireToken(env) {
    const token = env.GITHUB_TOKEN;
    if (!token) {
        throw new UsageError("GITHUB_TOKEN is not set — required to read the GHCR registry and Packages API " +
            "(and, for `apply`, to delete versions and manage the breaker issue)");
    }
    return token;
}
/**
 * Builds the real, network-backed `RegistryReader`/`PackagesClient` pair
 * for `plan`/`apply`, resolving GHCR bearer tokens per configured package
 * via a shared token cache (one exchange per package, not per manifest
 * resolution).
 *
 * The raw registry reader is wrapped in exactly two decorators, in this
 * order:
 *
 * 1. {@link createCachingRegistryReader} (outermost — checked first): a
 *    digest already resolved anywhere in this run, for this package, is
 *    served from memory with no HTTP call and no limiter slot consumed.
 * 2. {@link createLimiter}, sized {@link DEFAULT_JOBS}/`--jobs`: every
 *    cache MISS queues behind this ONE shared gate, so the planning
 *    core's newly-concurrent per-tag and per-BFS-node fan-out
 *    (`roots.ts`, `reachability.ts`) — now fired freely with no limit of
 *    its own — still hits `ghcr.io` with no more than `jobs` requests in
 *    flight at any moment, for the whole run, not per package.
 *
 * This is the ONLY place either decorator is applied: `planPackage` and
 * everything it calls stay unaware that concurrency is bounded at all.
 *
 * `canaryPackage`, when given, is registered in the same `pathFor` token
 * map as every selected package — the apply canary is a property of the
 * WHOLE RUN, not of whichever packages `--package` happened to select,
 * so it must resolve a bearer token regardless of scoping. Without this,
 * `--package <x>` where the canary lives in some other package leaves
 * the canary's registry path unmapped: the token lookup inside
 * `rawRegistry` throws immediately, and `applyPlan`'s pre-flight canary
 * check reports a bare "canary-failed" for a run that never actually
 * touched the registry for it. This was the first real `apply` run's
 * abort.
 */
/**
 * Builds the `RegistryPath -> PackageName` map {@link buildRegistryAdapters}
 * uses to resolve a GHCR bearer token per package. Extracted as its own
 * pure, exported function (no network, no token exchange) specifically so
 * the `--package`-scoping defect this fixes — the canary's package
 * silently absent from the map whenever `--package` excludes it — is
 * unit-testable without touching the registry at all: the bug and its fix
 * are both fully expressed in which keys end up in this map, before any
 * HTTP request is ever made.
 *
 * `entries` are the packages selected for this run (post `--package`
 * filtering); `canaryPackage`, always registered when given regardless of
 * that filtering, is the run-level apply canary (see
 * {@link buildRegistryAdapters}'s doc for why it cannot be scoped away).
 */
function buildPackageTokenMap(registryOwner, entries, canaryPackage) {
    const pathToName = new Map();
    const add = (p) => {
        pathToName.set(registryPathFor(registryOwner, p), p);
    };
    for (const entry of entries) {
        add(entry.match);
    }
    if (canaryPackage) {
        add(canaryPackage);
    }
    return pathToName;
}
/**
 * Which token `githubIssueBreaker` should authenticate with — deliberately
 * SEPARATE from the registry/Packages-API token, which for `apply` is
 * typically a `delete:packages`-scoped PAT with no issues access (see
 * `breaker.ts`'s `githubIssueBreaker` doc for what happens when the two
 * are conflated: a bare 404 with no indication the token was the
 * problem). Precedence, highest first: `--breaker-token`, then
 * `GHCR_TIDY_BREAKER_TOKEN`, then `fallback` (the registry token itself)
 * — the last resort exists only for setups where one token legitimately
 * carries both scopes (e.g. local/dry-run use with a broadly-scoped PAT).
 * Pure and side-effect-free specifically so this precedence is
 * unit-testable without constructing an Octokit client or making any
 * network call — mirroring {@link buildPackageTokenMap}'s reason for
 * being its own function.
 */
function resolveBreakerToken(args, env, fallback) {
    return args.breakerToken ?? env.GHCR_TIDY_BREAKER_TOKEN ?? fallback;
}
function buildRegistryAdapters(token, owner, registryOwner, entries, octokit, jobs, canaryPackage) {
    const pathToName = new Map(buildPackageTokenMap(registryOwner, entries, canaryPackage));
    const pathFor = (p) => {
        const rp = registryPathFor(registryOwner, p);
        pathToName.set(rp, p);
        return rp;
    };
    const tokenCache = createInMemoryTokenCache();
    const rawRegistry = createRegistryReader(async (rp) => {
        const name = pathToName.get(rp);
        if (!name) {
            throw new Error(`no configured package maps to registry path ${rp}`);
        }
        return getRegistryToken(token, name, { cache: tokenCache });
    });
    const limit = createLimiter(jobs);
    const limitedRegistry = {
        listTags: (p) => limit(() => rawRegistry.listTags(p)),
        resolve: (p, ref) => limit(() => rawRegistry.resolve(p, ref)),
    };
    const registry = createCachingRegistryReader(limitedRegistry);
    const packages = createPackagesClient(octokit);
    return { registry, packages, pathFor };
}
/** One line per {@link PackagePlanResult}, terse enough for {@link runPlanning}'s per-package progress lines — NOT the multi-line detail `formatPlanSummary` prints at the end of a run. */
function progressOutcomeSummary(result) {
    switch (result.status) {
        case "nothing-to-do":
            return "nothing to do";
        case "skipped":
            return `SKIPPED (${result.reason})`;
        case "planned":
            return (`${String(result.deleteCount)} to delete in ${String(result.groups.length)} group(s)` +
                (result.brokenRootDigests.length > 0
                    ? `, including ${String(result.brokenRootDigests.length)} broken root(s) (proven not-found)`
                    : ""));
    }
}
/**
 * Plans every selected package, then assembles a persisted {@link Plan}
 * (`apply`-ready) from whichever of them came back `"planned"`.
 * Concurrency bounded by `--jobs` (default {@link DEFAULT_JOBS}).
 *
 * Emits one terse progress line via `progress` when each package STARTS
 * and another when it FINISHES (with its result and elapsed time) — a
 * multi-package run against a real registry is dominated by HTTP round
 * trips per package and can legitimately take minutes; with no output at
 * all in between, that is indistinguishable from a hang. `progress`
 * defaults to `process.stderr.write` (not stdout: stdout is reserved for
 * `formatPlanSummary`'s final report and, when `--out` is not used, is
 * the only machine-parseable-adjacent output this CLI produces — progress
 * lines must never get mixed into it) and is injectable purely so tests
 * do not have to assert against real stderr.
 */
async function runPlanning(manifest, entries, registry, packagesClient, clock, jobs, deleteBrokenRoots, progress = (line) => {
    process.stderr.write(line);
}) {
    const total = entries.length;
    const outcomes = await runPool(entries, jobs, async (entry, index) => {
        const n = index + 1;
        progress(`[ghcr-tidy] (${String(n)}/${String(total)}) planning ${entry.match}...\n`);
        const startedAt = Date.now();
        const policy = resolvePolicy(entry, manifest);
        const result = await planPackage({
            org: manifest.owner,
            registryOwner: manifest.owner,
            packageName: entry.match,
            registry,
            packages: packagesClient,
            clock,
            policy: {
                retention: {
                    protectedTagPatterns: policy.protectedTagPatterns,
                    keepLast: policy.keepLast,
                    keepDays: policy.keepDays,
                },
                graceDays: policy.graceDays,
            },
            deleteBrokenRoots,
        });
        const elapsedMs = Date.now() - startedAt;
        progress(`[ghcr-tidy] (${String(n)}/${String(total)}) ${entry.match}: ${progressOutcomeSummary(result)} (${String(elapsedMs)}ms)\n`);
        return { entry, result };
    });
    const packages = outcomes
        .filter((o) => o.result.status === "planned")
        .map((o) => toPersistedPackagePlan(o.entry.match, o.result));
    const plan = {
        schemaVersion: 1,
        org: manifest.owner,
        generatedAt: clock.now().toISOString(),
        packages,
    };
    return { outcomes, plan };
}
function formatPlanSummary(outcomes) {
    const lines = [];
    let totalDelete = 0;
    let totalGroups = 0;
    let skipped = 0;
    for (const { entry, result } of outcomes) {
        if (result.status === "nothing-to-do") {
            lines.push(`  ${entry.match}: nothing to do`);
        }
        else if (result.status === "skipped") {
            skipped += 1;
            lines.push(`  ${entry.match}: SKIPPED (${result.reason}) — ${result.detail}`);
        }
        else {
            totalDelete += result.deleteCount;
            totalGroups += result.groups.length;
            lines.push(`  ${entry.match}: ${String(result.deleteCount)} to delete in ${String(result.groups.length)} group(s) ` +
                `(live roots ${String(result.liveRootsCount)}, kept ${String(result.keepRootsCount)}, ` +
                `reachable ${String(result.reachableCount)}, inflight ${String(result.inflightCount)})` +
                (result.brokenRootDigests.length > 0
                    ? ` — broken root(s) proven not-found: ${result.brokenRootDigests.join(", ")}`
                    : ""));
        }
    }
    return [
        `planned ${String(outcomes.length)} package(s): ${String(totalGroups)} group(s), ` +
            `${String(totalDelete)} version(s) to delete, ${String(skipped)} skipped (fail-closed)`,
        ...lines,
    ].join("\n");
}
async function writePlanFile(plan, outPath, fs) {
    const dir = external_node_path_default().dirname(outPath);
    await fs.mkdir(dir);
    await fs.writeFile(outPath, serializePlan(plan));
}
async function runValidateCommand(args) {
    const manifest = await loadManifestFile(args.manifest);
    process.stdout.write(`manifest OK — owner "${manifest.owner}", ${String(manifest.packages.length)} package(s) configured\n`);
    return EXIT_OK;
}
async function runPlanCommand(args, deps) {
    const manifest = await loadManifestFile(args.manifest);
    const entries = selectPackages(manifest, args.packages);
    const registryOwner = args.registryOwner ?? manifest.owner;
    const clock = deps.clock ?? cli_systemClock;
    const jobs = args.jobs ?? DEFAULT_JOBS;
    let registry;
    let packagesClient;
    if (deps.registry && deps.packages) {
        registry = deps.registry;
        packagesClient = deps.packages;
    }
    else {
        const token = requireToken(process.env);
        const octokit = createOctokit(token);
        const adapters = buildRegistryAdapters(token, manifest.owner, registryOwner, entries, octokit, jobs);
        registry = deps.registry ?? adapters.registry;
        packagesClient = deps.packages ?? adapters.packages;
    }
    const { outcomes, plan } = await runPlanning(manifest, entries, registry, packagesClient, clock, jobs, args.deleteBrokenRoots, deps.progress);
    process.stdout.write(`${formatPlanSummary(outcomes)}\n`);
    if (args.out !== undefined) {
        const fs = deps.planFs ?? nodePlanFileSystem();
        await writePlanFile(plan, external_node_path_default().resolve(args.out), fs);
        process.stdout.write(`plan written to ${args.out}\n`);
    }
    const hadSkip = outcomes.some((o) => o.result.status === "skipped");
    return hadSkip ? EXIT_FINDINGS : EXIT_OK;
}
/** Renders one {@link CanaryFailureReason} into an operator-facing phrase — see that type's doc for the three cases. */
function formatCanaryFailureReason(reason) {
    switch (reason.kind) {
        case "resolve-failed":
            return `tag failed to resolve (${reason.state})`;
        case "closure-failed":
            return `tag resolved but its manifest closure failed to resolve (${reason.state})`;
        case "error":
            return `error while resolving: ${reason.message}`;
    }
}
/** Renders one {@link ApplyAbortReason} for the `ABORTED:` line — the `canary-failed` case additionally names the canary's own path/tag and the cause, since a bare "canary-failed" gave no way to diagnose the first real apply's spurious abort. The `regression` case additionally names a `sinkError` (the breaker itself failed to record the — still real, still confirmed — regression) rather than letting that failure erase the summary line entirely, as it did in the incident that motivated `sinkError`. */
function formatAbortReason(reason) {
    if (reason.kind === "canary-failed") {
        return `canary-failed (canary ${reason.path}:${reason.tag} — ${formatCanaryFailureReason(reason.reason)})`;
    }
    if (reason.kind === "regression" && reason.sinkError !== undefined) {
        return `regression (breaker also failed to record it: ${reason.sinkError})`;
    }
    if (reason.kind === "verification-unavailable") {
        return `verification-unavailable (${String(reason.tags.length)} tag(s) could not be confirmed healthy or broken in package ${reason.packageName} — not treated as a regression, breaker not tripped)`;
    }
    return reason.kind;
}
function summarizeApplyResult(plan, result) {
    const lines = [];
    for (const pkg of result.packages) {
        for (const group of pkg.groups) {
            const deleted = group.members.filter((m) => m.result === "deleted" || m.result === "already-gone").length;
            const failed = group.members.filter((m) => m.result === "error" || m.result === "last-version-conflict").length;
            const notAttempted = group.members.filter((m) => m.result === "not-attempted").length;
            lines.push(`  ${pkg.packageName} group ${group.root}: ${group.status} — ${String(deleted)} deleted, ` +
                `${String(failed)} failed, ${String(notAttempted)} not attempted`);
        }
        // Never a failure and never sunk to the breaker (see `verify.ts`'s
        // `republished` doc) — reported here purely as context: the
        // registry changed under this run, which is normal in a repo whose
        // CI publishes continuously, not something an operator needs to act
        // on.
        if (pkg.republishedTags.length > 0) {
            lines.push(`  ${pkg.packageName}: ${String(pkg.republishedTags.length)} tag(s) republished by ` +
                `something else during this run (not a regression): ` +
                `${pkg.republishedTags.map((t) => t.tag).join(", ")}`);
        }
    }
    const header = `attempted ${String(result.attempted)} of ${String(plannedDeletionCount(plan))} planned deletion(s), ` +
        `${String(result.remainingBudget)} budget remaining` +
        (result.abortedFor ? `, ABORTED: ${formatAbortReason(result.abortedFor)}` : "");
    return [header, ...lines].join("\n");
}
async function runApplyCommand(args, deps) {
    if (!args.apply) {
        throw new UsageError("`apply` requires the explicit --apply flag in addition to the subcommand — " +
            "two independent gestures are required to delete anything");
    }
    if (args.budget === undefined) {
        throw new UsageError("`apply` requires --budget <n>");
    }
    if (args.out === undefined) {
        throw new UsageError("`apply` requires --out <path> — the plan is written there and re-read before any deletion is granted (grantApply's round trip)");
    }
    const manifest = await loadManifestFile(args.manifest);
    const entries = selectPackages(manifest, args.packages);
    const registryOwner = args.registryOwner ?? manifest.owner;
    const clock = deps.clock ?? cli_systemClock;
    const jobs = args.jobs ?? DEFAULT_JOBS;
    // The canary's package, resolved here — BEFORE `--package` filtering
    // is baked into the registry adapters below — because the canary is a
    // property of the whole run, not of whichever packages `--package`
    // happened to select (see `buildRegistryAdapters`'s doc). A malformed
    // name is swallowed here on purpose: this is only a best-effort
    // registration for the token map, and the proper, user-facing error is
    // still raised below, at the point where the canary is actually
    // required (only once it is known the plan has work to verify).
    const canaryPackageRaw = args.canaryPackage ?? manifest.canary?.package;
    let canaryPackageForRegistry;
    if (canaryPackageRaw !== undefined) {
        try {
            canaryPackageForRegistry = packageName(canaryPackageRaw);
        }
        catch {
            // Deferred to the validation below, which runs only if the plan
            // turns out to have work to verify.
        }
    }
    // A production Octokit client is needed for any of: the registry
    // adapters, the mutator, or the breaker — built once, lazily, only if at
    // least one of those was not already supplied by `deps` (tests supply
    // all of them and so never require a real token at all).
    const needsOctokit = !deps.registry || !deps.packages || !deps.mutator || !deps.breaker;
    const token = needsOctokit ? requireToken(process.env) : undefined;
    const octokit = token !== undefined ? createOctokit(token) : undefined;
    let registry;
    let packagesClient;
    if (deps.registry && deps.packages) {
        registry = deps.registry;
        packagesClient = deps.packages;
    }
    else {
        // token/octokit are guaranteed defined here: needsOctokit is true
        // whenever this branch is reached (deps.registry or deps.packages
        // missing implies needsOctokit).
        const adapters = buildRegistryAdapters(token, manifest.owner, registryOwner, entries, octokit, jobs, canaryPackageForRegistry);
        registry = adapters.registry;
        packagesClient = adapters.packages;
    }
    // The breaker is mandatory, unconditionally — see this module's doc and
    // apply.ts's doc on why "apply with no breaker" must not be reachable.
    let breaker;
    if (deps.breaker) {
        breaker = deps.breaker;
    }
    else {
        const repoSpec = args.breakerRepo ?? process.env.GITHUB_REPOSITORY;
        if (!repoSpec) {
            throw new UsageError("no breaker configured: pass --breaker-repo <owner>/<repo> or set GITHUB_REPOSITORY " +
                "— apply refuses to run without a circuit breaker");
        }
        const [breakerOwner, breakerRepo] = repoSpec.split("/", 2);
        if (!breakerOwner || !breakerRepo) {
            throw new UsageError(`--breaker-repo/GITHUB_REPOSITORY must be "<owner>/<repo>", got "${repoSpec}"`);
        }
        const breakerTokenValue = resolveBreakerToken(args, process.env, token);
        const breakerOctokit = breakerTokenValue === token ? octokit : createOctokit(breakerTokenValue);
        breaker = githubIssueBreaker(breakerOctokit, breakerOwner, breakerRepo, {
            ...(args.journal !== undefined && { journalPath: args.journal }),
        });
    }
    const { outcomes, plan } = await runPlanning(manifest, entries, registry, packagesClient, clock, jobs, args.deleteBrokenRoots, deps.progress);
    process.stdout.write(`${formatPlanSummary(outcomes)}\n`);
    const fs = deps.planFs ?? nodePlanFileSystem();
    const outPath = external_node_path_default().resolve(args.out);
    await writePlanFile(plan, outPath, fs);
    const cap = await grantApply(plan, outPath, fs);
    process.stdout.write(`plan written and re-verified at ${args.out}\n`);
    const mutator = deps.mutator ?? applyMutator(octokit, manifest.owner, cap);
    const hasWork = totalGroupCount(plan) > 0;
    let verification;
    if (hasWork) {
        // `--canary-package`/`--canary-tag` OVERRIDE `manifest.canary`,
        // field by field, when present; otherwise the manifest's value (if
        // any) is used. The manifest is the source that survives every
        // trigger — see `manifest/schema.ts`'s `ManifestCanary` doc for why a
        // `schedule`-triggered run can never rely on a CLI-flag-only canary.
        // `canaryPackageRaw` was already resolved above (before the registry
        // adapters were built); only `canaryTagRaw` is new here.
        const canaryTagRaw = args.canaryTag ?? manifest.canary?.tag;
        if (!canaryPackageRaw || !canaryTagRaw) {
            throw new UsageError("this plan has deletions to attempt but no canary is configured — add `canary: " +
                "{ package, tag }` to the manifest, or pass --canary-package <name> --canary-tag " +
                "<tag> (a known-good tag resolved before any deletion). Verification is not " +
                "optional on the apply path.");
        }
        // Reuse the package already parsed above when it succeeded; only
        // re-parse (to surface the proper error) if it did not.
        let canaryPkg;
        if (canaryPackageForRegistry !== undefined) {
            canaryPkg = canaryPackageForRegistry;
        }
        else {
            try {
                canaryPkg = packageName(canaryPackageRaw);
            }
            catch (error) {
                throw new UsageError(`canary package "${canaryPackageRaw}": ${errorMessage(error)}`);
            }
        }
        let canaryTagValue;
        try {
            canaryTagValue = tag(canaryTagRaw);
        }
        catch (error) {
            throw new UsageError(`canary tag "${canaryTagRaw}": ${errorMessage(error)}`);
        }
        verification = {
            registry,
            canary: { path: registryPathFor(registryOwner, canaryPkg), tag: canaryTagValue },
            sink: breakerRegressionSink(breaker),
            // Printed to stdout BEFORE `sink.record` (which calls the
            // breaker, a network operation) is even attempted — so the
            // incident survives a breaker outage instead of vanishing behind
            // a bare "Not Found" the way it did in the run that motivated
            // this (see `apply.ts`'s `VerificationOptions.onIncident` doc).
            onIncident: (incident) => {
                process.stdout.write(`${formatIncidentReport(incident, { ...(args.journal !== undefined && { journalPath: args.journal }) })}\n`);
            },
        };
    }
    const journal = deps.journal ?? (args.journal ? ndjsonJournal(args.journal) : undefined);
    const result = await applyPlan(plan, mutator, {
        budget: args.budget,
        breaker,
        ...(journal && { journal }),
        ...(args.baseline !== undefined && { volumeAlarm: { baseline: args.baseline } }),
        ...(verification && { verification }),
    });
    process.stdout.write(`${summarizeApplyResult(plan, result)}\n`);
    const applyExit = classifyApplyExit(plan, result);
    if (applyExit === EXIT_APPLY_SAFETY) {
        return EXIT_SAFETY;
    }
    if (applyExit === EXIT_APPLY_MUTATION_FAILURE) {
        return EXIT_FINDINGS;
    }
    if (applyExit !== EXIT_APPLY_OK) {
        // Unreachable given classifyApplyExit's three-value range — guards
        // against a silent exit-code drift if that range ever grows.
        throw new Error(`unexpected apply exit classification: ${String(applyExit)}`);
    }
    const hadPlanSkip = outcomes.some((o) => o.result.status === "skipped");
    return hadPlanSkip ? EXIT_FINDINGS : EXIT_OK;
}
/** Runs the CLI end-to-end and returns the process exit code — never calls `process.exit` itself. */
async function runCommand(argv, deps = {}) {
    let subcommand;
    let args;
    try {
        ({ subcommand, args } = parseArgv(argv));
    }
    catch (error) {
        process.stderr.write(`${errorMessage(error)}\n`);
        return EXIT_CONFIG;
    }
    try {
        switch (subcommand) {
            case "validate":
                return await runValidateCommand(args);
            case "plan":
                return await runPlanCommand(args, deps);
            case "apply":
                return await runApplyCommand(args, deps);
        }
    }
    catch (error) {
        if (error instanceof ManifestError || error instanceof UsageError) {
            process.stderr.write(`${errorMessage(error)}\n`);
            return EXIT_CONFIG;
        }
        // A plan-integrity violation (assertGroupsAreWellFormed / assertNoSurvivingParent)
        // is a thrown Error, not a return value — and is exactly a safety-severity
        // finding: the plan itself was shown to be structurally wrong.
        if (error instanceof Error && /plan integrity violation/.test(error.message)) {
            process.stderr.write(`${error.message}\n`);
            return EXIT_SAFETY;
        }
        process.stderr.write(`${errorMessage(error)}\n`);
        return EXIT_INFRA;
    }
}
/**
 * Splits a single argument string (e.g. `INPUT_ARGS`'s value) into argv
 * tokens, respecting single- and double-quoted segments.
 */
function tokenizeArgs(input) {
    const tokens = [];
    let current = "";
    let hasToken = false;
    let quote;
    for (const ch of input) {
        if (quote !== undefined) {
            if (ch === quote) {
                quote = undefined;
            }
            else {
                current += ch;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            hasToken = true;
            continue;
        }
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
            if (hasToken) {
                tokens.push(current);
                current = "";
                hasToken = false;
            }
            continue;
        }
        current += ch;
        hasToken = true;
    }
    if (hasToken) {
        tokens.push(current);
    }
    return tokens;
}
/**
 * Picks argv for the run: `INPUT_ARGS` when defined (running as a future
 * JS action), falling back to real `process.argv` otherwise. Tests
 * "defined" rather than "non-empty" so an explicitly-set-but-empty
 * `INPUT_ARGS` is treated as a usage error below, not silently ignored
 * in favour of `process.argv`.
 */
function resolveArgv(env, argv) {
    const inputArgs = env.INPUT_ARGS;
    if (inputArgs === undefined) {
        return [...argv];
    }
    if (inputArgs.trim() === "") {
        throw new UsageError("the `args` input is empty — pass a subcommand and flags (e.g. `plan --manifest .ghcr-tidy.yaml`)");
    }
    return tokenizeArgs(inputArgs);
}
/* c8 ignore start -- process wiring, exercised via runCommand in tests */
async function mainEntry() {
    let argv;
    try {
        argv = resolveArgv(process.env, process.argv.slice(2));
    }
    catch (error) {
        process.stderr.write(`${errorMessage(error)}\n`);
        process.exitCode = EXIT_CONFIG;
        return;
    }
    const exitCode = await runCommand(argv);
    process.exitCode = exitCode;
}
const isDirectRun = process.argv[1] !== undefined && import.meta.url === `file://${external_node_path_default().resolve(process.argv[1])}`;
if (isDirectRun) {
    void mainEntry();
}
/* c8 ignore stop */

var __webpack_exports__buildPackageTokenMap = __webpack_exports__.QH;
var __webpack_exports__parseArgv = __webpack_exports__.SB;
var __webpack_exports__resolveArgv = __webpack_exports__.rf;
var __webpack_exports__resolveBreakerToken = __webpack_exports__.u9;
var __webpack_exports__runCommand = __webpack_exports__.d1;
var __webpack_exports__tokenizeArgs = __webpack_exports__.vL;
export { __webpack_exports__buildPackageTokenMap as buildPackageTokenMap, __webpack_exports__parseArgv as parseArgv, __webpack_exports__resolveArgv as resolveArgv, __webpack_exports__resolveBreakerToken as resolveBreakerToken, __webpack_exports__runCommand as runCommand, __webpack_exports__tokenizeArgs as tokenizeArgs };
