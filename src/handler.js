import lighthouse from 'lighthouse'

global.setImmediate = (callback, ...argsForCallback) => {
  Promise.resolve().then(() => callback(...argsForCallback))
  return 0
}
/* eslint-disable */
import config from "./config";
import { spawn as spawnChrome, kill as killChrome } from "./chrome";
import { log } from "./utils";
import fs from 'fs'
import perfConfig from 'lighthouse/lighthouse-core/config/perf'
import AWS from 'aws-sdk'
const urlParse = require('url')
const s3 = new AWS.S3();

/**
   * @param {!Driver} driver
   * @param {!GathererResults} gathererResults
   * @param {!Object} options
   * @return {!Promise}
   */
const setupDriver = (driver, gathererResults, options) => {
  const setCookies = (cookiesJson, cookieHost, url) => {
    if(cookiesJson) {
      console.log('cookiesJson')
      console.log(JSON.stringify(cookiesJson))
      cookiesJson.forEach((cookie) => {
        cookie.domain = cookieHost
        cookie.url = url
        driver.sendCommand("Network.setCookie", cookie);
      });
    }
  }

  const setExtraHTTPHeaders = jsonHeaders => {
    let headers;
    try {
      headers = jsonHeaders;
    } catch (e) {
      // log.warn("Driver", "Invalid header JSON");
      headers = {};
    }
    console.log('headers')
    console.log(JSON.stringify(headers))
    return driver.sendCommand("Network.setExtraHTTPHeaders", { headers });
  };
  // log.log('status', 'Initializing…');
  const resetStorage = !options.flags.disableStorageReset;
  // Enable emulation based on flags
  return driver
    .assertNoSameOriginServiceWorkerClients(options.url)
    .then(_ => (gathererResults.UserAgent = [driver.getUserAgent()]))
    .then(_ => driver.beginEmulation(options.flags))
    .then(_ => driver.enableRuntimeEvents())
    .then(_ => driver.cacheNatives())
    .then(_ => driver.registerPerformanceObserver())
    .then(_ => driver.dismissJavaScriptDialogs())
    .then(_ => resetStorage && driver.clearDataForOrigin(options.url))
    .then(_ => setExtraHTTPHeaders(options.flags.extraHeaders || "{}"))
    .then(_ => setCookies(options.flags.cookies, options.flags.cookieHost, options.flags.cookieUrl));
};

const runner = require("lighthouse/lighthouse-core/gather/gather-runner");
runner.setupDriver = setupDriver;

export async function run(event, context, callback) {
  console.log(JSON.stringify(event));
  try {
    await spawnChrome();
  } catch (error) {
    console.error("Error in spawning Chrome");
    return callback(error);
  }
  let url = event.url
  let parsedUrl = urlParse.parse(url)
  let host = parsedUrl.host
  let path = parsedUrl.path
  let flags = {}
  flags.port = 9222;
  flags.extraHeaders = event.headers;
  flags.cookies = event.cookies;
  flags.cookieHost = host
  flags.cookieUrl = url

  let results = await lighthouse(url, flags, perfConfig);

  let now = Date.now()
  let prefix = event.prefix 
  let key = `${prefix}/${event.objectKey}.json`
  let bucket = event.bucket
  console.log(key)
  try {
    
    await killChrome();
    return new Promise((resolve, reject) => {
      var params = {
        Body: JSON.stringify(results), 
        Bucket: bucket, 
        Key: key, 
       };
    
       s3.putObject(params, function(err, data) {
         if (err) {
           console.log(err, err.stack) && reject(err); // an error occurred
         } else {
           console.log(data);
           resolve(callback(null, {
            statusCode: 200,
            body: JSON.stringify({
              report: `https://s3-us-west-2.amazonaws.com/${bucket}/${key}`
            })
          }));
         }    
       });
    });
  } catch (error) {
    console.error('Error in spawning Chrome')
    return callback(error)
  }
}