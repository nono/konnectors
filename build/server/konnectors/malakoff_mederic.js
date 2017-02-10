// Generated by CoffeeScript 1.11.1
var Bill, baseKonnector, buildNotification, cheerio, domain, fileOptions, filterExisting, linkBankOperation, localization, log, logIn, moment, parsePage, request, saveDataAndFile;

request = require('request');

moment = require('moment');

cheerio = require('cheerio');

Bill = require('../models/bill');

baseKonnector = require('../lib/base_konnector');

filterExisting = require('../lib/filter_existing');

saveDataAndFile = require('../lib/save_data_and_file');

linkBankOperation = require('../lib/link_bank_operation');

localization = require('../lib/localization_manager');

log = require('printit')({
  prefix: "Malakoff Mederic",
  date: true
});

domain = "https://extranet.malakoffmederic.com";

logIn = function(requiredFields, billInfos, data, next) {
  var options;
  options = {
    method: 'GET',
    jar: true,
    url: domain + "/espaceClient/LogonAccess.do"
  };
  return request(options, function(err, res, body) {
    var engineUrl, genOptions, httpSessionId;
    if (err) {
      return next('request error');
    }
    httpSessionId = res.headers['set-cookie'][0];
    httpSessionId = httpSessionId.split(';')[0];
    httpSessionId = httpSessionId.split('=')[1];
    engineUrl = "https://extranet.malakoffmederic.com/dwr/engine.js";
    genOptions = {
      url: engineUrl,
      jar: true
    };
    return request(genOptions, function(err, res, body) {
      var checkOption, id, matches, path, regexp, scriptSessionId, submitUrl;
      if (err) {
        return next('request error');
      }
      regexp = /dwr.engine._origScriptSessionId = "([A-Z0-9]+)"/g;
      matches = body.match(regexp);
      id = matches[0].split('"')[1];
      scriptSessionId = id + Math.floor(Math.random() * 1000);
      path = "/dwr/call/plaincall/InternauteValidator.checkConnexion.dwr";
      submitUrl = "" + domain + path;
      checkOption = {
        method: 'POST',
        jar: true,
        url: submitUrl,
        headers: {
          'Content-Type': 'text/plain'
        },
        body: "callCount=1\npage=/espaceClient/LogonAccess.do\nhttpSessionId=" + httpSessionId + "\nscriptSessionId=" + scriptSessionId + "\nc0-scriptName=InternauteValidator\nc0-methodName=checkConnexion\nc0-id=0\nc0-param0=boolean:false\nc0-param1=string:" + requiredFields.login + "\nc0-param2=string:" + requiredFields.password + "\nbatchId=0\n"
      };
      return request(checkOption, function(err, res, body) {
        var reimbursementUrl;
        if (err) {
          log.error(err);
          return next('request error');
        } else if (res.statusCode >= 400) {
          log.error('Authentication error');
          return next('request error');
        } else if (body.indexOf('LOGON_KO') > -1) {
          log.error('Authentication error');
          return next('bad credentials');
        }
        log.info('Logged in');
        path = "/espaceClient/sante/tbs/redirectionAction.do";
        reimbursementUrl = "" + domain + path;
        options = {
          method: 'GET',
          url: reimbursementUrl,
          jar: true
        };
        return request(options, function(err, res, body) {
          if (err) {
            log.error(err);
            return next('request error');
          }
          data.html = body;
          return next();
        });
      });
    });
  });
};

parsePage = function(requiredFields, healthBills, data, next) {
  var $;
  healthBills.fetched = [];
  if (data.html == null) {
    return next();
  }
  $ = cheerio.load(data.html);
  $('.headerRemboursements').each(function() {
    var amount, bill, date, dateText, pdfUrl;
    amount = $(this).find('.montant').text();
    amount = amount.replace(' €', '').replace(',', '.');
    amount = parseFloat(amount);
    dateText = $(this).find('.dateEmission').text();
    date = dateText.split('Emis le ')[1].split('aux')[0];
    pdfUrl = $(this).find('#tbsRembExportPdf').attr('href');
    pdfUrl = "" + domain + pdfUrl;
    bill = {
      amount: amount,
      type: 'health',
      date: moment(date, 'DD/MM/YYYY'),
      vendor: 'Malakoff Mederic',
      pdfurl: pdfUrl
    };
    if (bill.amount != null) {
      return healthBills.fetched.push(bill);
    }
  });
  return next();
};

buildNotification = function(requiredFields, healthBills, data, next) {
  var localizationKey, notifContent, options, ref;
  log.info("Import finished");
  notifContent = null;
  if ((healthBills != null ? (ref = healthBills.filtered) != null ? ref.length : void 0 : void 0) > 0) {
    localizationKey = 'notification bills';
    options = {
      smart_count: healthBills.filtered.length
    };
    healthBills.notifContent = localization.t(localizationKey, options);
  }
  return next();
};

fileOptions = {
  vendor: 'Malakoffmederic',
  dateFormat: 'YYYYMMDD'
};

module.exports = baseKonnector.createNew({
  name: "Malakoff Mederic",
  vendorLink: "http://www.malakoffmederic.com/index.jsp",
  fields: {
    login: {
      type: "text"
    },
    password: {
      type: "password"
    },
    folderPath: {
      type: "folder"
    }
  },
  dataType: ['health', 'bill'],
  models: [Bill],
  fetchOperations: [
    logIn, parsePage, filterExisting(log, Bill), saveDataAndFile(log, Bill, fileOptions, ['health', 'bill']), linkBankOperation({
      log: log,
      model: Bill,
      dateDelta: 10,
      amountDelta: 0.1,
      identifier: 'MALAKOFF MEDERIC'
    }), buildNotification
  ]
});
