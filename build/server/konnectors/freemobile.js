// Generated by CoffeeScript 1.11.1
var File, PhoneBill, async, cheerio, cozydb, fetcher, filterExisting, fs, getBillPage, getImageAndIdentifyNumber, getImageAndIdentifyNumbers, getNumberValue, getSmallImage, getSound, linkBankOperation, localization, log, logIn, logOut, moment, parseBillPage, pngjs, prepareLogIn, request, requestJson, saveDataAndFile, transcodeLogin, unifyLogin;

cozydb = require('cozydb');

requestJson = require('request-json');

moment = require('moment');

cheerio = require('cheerio');

fs = require('fs');

async = require('async');

pngjs = require('pngjs-image');

request = require('request');

File = require('../models/file');

fetcher = require('../lib/fetcher');

filterExisting = require('../lib/filter_existing');

saveDataAndFile = require('../lib/save_data_and_file');

linkBankOperation = require('../lib/link_bank_operation');

localization = require('../lib/localization_manager');

log = require('printit')({
  prefix: "Free Mobile",
  date: true
});

request = request.defaults({
  headers: {
    "User-Agent": "Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:37.0) Gecko/20100101 Firefox/37.0"
  }
});

PhoneBill = cozydb.getModel('PhoneBill', {
  date: Date,
  vendor: String,
  amount: Number,
  fileId: String,
  pdfurl: String,
  binaryId: String,
  type: String
});

PhoneBill.all = function(callback) {
  return PhoneBill.request('byDate', callback);
};

module.exports = {
  name: "Free Mobile",
  slug: "freemobile",
  description: 'konnector description free mobile',
  vendorLink: "https://mobile.free.fr/",
  category: 'telecom',
  color: {
    hex: '#CD1E25',
    css: '#CD1E25'
  },
  fields: {
    login: {
      type: "text"
    },
    password: {
      type: "password"
    },
    folderPath: {
      type: "folder",
      advanced: true
    }
  },
  dataType: ['bill'],
  models: {
    phonebill: PhoneBill
  },
  init: function(callback) {
    var map;
    map = function(doc) {
      return emit(doc.date, doc);
    };
    return PhoneBill.defineRequest('byDate', map, function(err) {
      return callback(err);
    });
  },
  fetch: function(requiredFields, callback) {
    log.info("Import started");
    return fetcher["new"]().use(prepareLogIn).use(getImageAndIdentifyNumbers).use(logIn).use(getBillPage).use(parseBillPage).use(filterExisting(log, PhoneBill)).use(saveDataAndFile(log, PhoneBill, {
      vendor: 'freemobile',
      others: ['phonenumber']
    }, ['facture'])).use(linkBankOperation({
      log: log,
      model: PhoneBill,
      identifier: 'free mobile',
      dateDelta: 14,
      amountDelta: 0.1
    })).use(logOut).args(requiredFields, {}, {}).fetch(function(err, fields, entries) {
      var localizationKey, notifContent, options, ref;
      log.info("Import finished");
      notifContent = null;
      if ((entries != null ? (ref = entries.filtered) != null ? ref.length : void 0 : void 0) > 0) {
        localizationKey = 'notification bills';
        options = {
          smart_count: entries.filtered.length
        };
        notifContent = localization.t(localizationKey, options);
      }
      return callback(err, notifContent);
    });
  }
};

logOut = function(requiredFields, billInfos, data, next) {
  var logOutUrl, options;
  logOutUrl = "https://mobile.free.fr/moncompte/index.php?logout=user";
  options = {
    method: 'GET',
    url: logOutUrl,
    jar: true
  };
  return request(options, function(err, res, body) {
    if (err != null) {
      log.error("Couldn't logout of Free Mobile website");
      next(err);
    }
    return next();
  });
};

prepareLogIn = function(requiredFields, billInfos, data, next) {
  var homeUrl, options;
  homeUrl = "https://mobile.free.fr/moncompte/index.php?page=home";
  options = {
    method: 'GET',
    jar: true,
    url: homeUrl
  };
  return request(options, function(err, res, body) {
    var $, loginPageData;
    if (err != null) {
      log.error("Cannot connect to Free Mobile : " + homeUrl);
      next(err);
    }
    loginPageData = body;
    data.imageUrlAndPosition = [];
    $ = cheerio.load(loginPageData);
    data.token = $('input[name=token]').val();
    $('img[class="ident_chiffre_img pointer"]').each(function() {
      var imagePath, position;
      imagePath = $(this).attr('src');
      position = $(this).attr('alt');
      position = position.replace('position ', '');
      return data.imageUrlAndPosition.push({
        imagePath: imagePath,
        position: position
      });
    });
    return next();
  });
};

getImageAndIdentifyNumbers = function(requiredFields, billInfos, data, next) {
  var urlAndPosition;
  urlAndPosition = data.imageUrlAndPosition;
  return async.map(urlAndPosition, getImageAndIdentifyNumber, function(err, results) {
    if (err != null) {
      log.error("Coud not get or decode image");
      next(err);
    }
    data.conversionTable = results;
    return next();
  });
};

logIn = function(requiredFields, billInfos, data, next) {
  var baseUrl, homeUrl, transcodedLogin, uniqueLogin;
  homeUrl = "https://mobile.free.fr/moncompte/index.php?page=home";
  baseUrl = "https://mobile.free.fr/moncompte/";
  transcodedLogin = transcodeLogin(requiredFields.login, data.conversionTable);
  uniqueLogin = unifyLogin(transcodedLogin);
  return async.eachSeries(uniqueLogin, getSmallImage, function(err) {
    var form, i, k, len, login, options;
    if (err != null) {
      next(err);
    }
    login = "";
    for (k = 0, len = transcodedLogin.length; k < len; k++) {
      i = transcodedLogin[k];
      login += i;
    }
    form = {
      token: data.token,
      login_abo: login,
      pwd_abo: requiredFields.password
    };
    options = {
      method: 'POST',
      form: form,
      jar: true,
      url: homeUrl,
      headers: {
        referer: homeUrl
      }
    };
    return request(options, function(err, res, body) {
      if ((err != null) || (res.headers.location == null) || res.statusCode !== 302) {
        log.error("Authentification error");
        if (err != null) {
          log.error(err);
        }
        if (res.headers.location == null) {
          log.error("No location");
        }
        if (res.statusCode !== 302) {
          log.error("No 302");
        }
        if (requiredFields.password == null) {
          log.error("No password");
        }
        if (requiredFields.login == null) {
          log.error("No login");
        }
        next('bad credentials');
      }
      options = {
        method: 'GET',
        jar: true,
        url: baseUrl + res.headers.location,
        headers: {
          referer: homeUrl
        }
      };
      return request(options, function(err, res, body) {
        var $, connectionForm;
        if (err != null) {
          next(err);
        }
        $ = cheerio.load(body);
        connectionForm = $('#form_connect');
        if (connectionForm.length !== 0) {
          log.error("Authentification error");
          next('bad credentials');
        }
        return next();
      });
    });
  });
};

getBillPage = function(requiredFields, billInfos, data, next) {
  var billUrl, options;
  billUrl = "https://mobile.free.fr/moncompte/index.php?page=suiviconso";
  options = {
    method: 'GET',
    url: billUrl,
    jar: true
  };
  return request(options, function(err, res, body) {
    if (err != null) {
      next(err);
    }
    data.html = body;
    return next();
  });
};

parseBillPage = function(requiredFields, bills, data, next) {
  var $, billUrl, isMultiline;
  bills.fetched = [];
  billUrl = "https://mobile.free.fr/moncompte/index.php?page=suiviconso&action=getFacture&format=dl&l=";
  if (data.html == null) {
    return next();
  }
  $ = cheerio.load(data.html);
  isMultiline = $('div.infosConso').length > 1;
  $('div.factLigne.is-hidden').each(function() {
    var amount, bill, data_fact_date, data_fact_id, data_fact_ligne, data_fact_login, data_fact_multi, date, pdfUrl;
    amount = $($(this).find('.montant')).text();
    amount = amount.replace('€', '');
    amount = parseFloat(amount);
    data_fact_id = $(this).attr('data-fact_id');
    data_fact_login = $(this).attr('data-fact_login');
    data_fact_date = $(this).attr('data-fact_date');
    data_fact_multi = parseFloat($(this).attr('data-fact_multi'));
    data_fact_ligne = $(this).attr('data-fact_ligne');
    pdfUrl = billUrl + data_fact_login + "&id=" + data_fact_id + "&date=" + data_fact_date + "&multi=" + data_fact_multi;
    date = moment(data_fact_date, 'YYYYMMDD');
    bill = {
      amount: amount,
      date: date,
      vendor: 'Free Mobile',
      type: 'phone'
    };
    if (isMultiline && !data_fact_multi) {
      bill.phonenumber = data_fact_ligne;
    }
    if (date.year() > 2011) {
      bill.pdfurl = pdfUrl;
    }
    return bills.fetched.push(bill);
  });
  return next();
};

getImageAndIdentifyNumber = function(imageInfo, callback) {
  var baseUrl;
  baseUrl = "https://mobile.free.fr/moncompte/";
  return getSound(imageInfo.position, function(err) {
    var options;
    if (err != null) {
      callback(err, null);
    }
    options = {
      method: 'GET',
      jar: true,
      url: "" + baseUrl + imageInfo.imagePath,
      encoding: null
    };
    return request(options, function(err, res, body) {
      if (err != null) {
        callback(err, null);
      }
      return pngjs.loadImage(body, function(err, resultImage) {
        var blue, green, idx, image, k, l, stringcheck, x, y;
        if (resultImage.getWidth() < 24 || resultImage.getHeight() < 28) {
          callback('Wrong image size', null);
        }
        stringcheck = "";
        for (x = k = 15; k <= 22; x = ++k) {
          for (y = l = 12; l <= 26; y = ++l) {
            idx = resultImage.getIndex(x, y);
            green = resultImage.getGreen(idx);
            blue = resultImage.getBlue(idx);
            if (green + blue < 450) {
              stringcheck += "1";
            } else {
              stringcheck += "0";
            }
          }
        }
        image = {
          position: "" + imageInfo.position,
          numberValue: "" + (getNumberValue(stringcheck))
        };
        return callback(err, image);
      });
    });
  });
};

getSound = function(position, callback) {
  var baseUrl, options;
  baseUrl = "https://mobile.free.fr/moncompte/";
  options = {
    method: 'GET',
    url: baseUrl + "chiffre.php?getsound=1&pos=" + position,
    jar: true,
    headers: {
      referer: baseUrl + "sound/soundmanager2_flash9.swf"
    }
  };
  return request(options, function(err, res, body) {
    if (err != null) {
      callback(err);
    }
    return callback(null);
  });
};

getNumberValue = function(stringcheck) {
  var distance, distanceMin, i, idxDistanceMin, j, k, l, ref, symbols;
  symbols = ['001111111111110011111111111111111111111111111110000000000011110000000000011111111111111111011111111111111001111111111110', '001110000000000001110000000000001110000000000011111111111111111111111111111111111111111111000000000000000000000000000000', '011110000001111011110000111111111000001111111110000011110011110000111100011111111111000011011111110000011001111000000011', '011100000011110111100000011111111000110000111110000110000011110001110000011111111111111111011111111111110001110001111100', '000000011111000000001111111000000111110011000011110000011000111111111111111111111111111111111111111111111000000000011000', '111111110011110111111110011111111001110000111111001100000011111001100000011111001111111111111001111111111010000111111110', '001111111111110011111111111111111111111111111110001100000011110001100000011111001111111111111101111111111011100111111110', '111000000000000111000000000000111000000011111111000011111111111011111111111111111111000000111111000000000111100000000000', '001110001111110011111111111111111111111111111110000110000011110000110000011111111111111111011111111111111001111001111110', '001111111000110011111111100111111111111100111110000001100011110000001100011111111111111111011111111111111001111111111110'];
  distanceMin = stringcheck.length;
  idxDistanceMin = 10;
  for (i = k = 0; k <= 9; i = ++k) {
    if (stringcheck === symbols[i]) {
      return i;
    } else {
      distance = 0;
      for (j = l = 0, ref = stringcheck.length - 1; 0 <= ref ? l <= ref : l >= ref; j = 0 <= ref ? ++l : --l) {
        if (stringcheck[j] !== symbols[i][j]) {
          distance += 1;
        }
      }
      if (distance < distanceMin) {
        idxDistanceMin = i;
        distanceMin = distance;
      }
    }
  }
  return idxDistanceMin;
};

transcodeLogin = function(login, conversionTable) {
  var conversion, i, k, l, len, len1, transcoded;
  transcoded = [];
  for (k = 0, len = login.length; k < len; k++) {
    i = login[k];
    for (l = 0, len1 = conversionTable.length; l < len1; l++) {
      conversion = conversionTable[l];
      if (conversion.numberValue === i) {
        transcoded.push(conversion.position);
      }
    }
  }
  return transcoded;
};

unifyLogin = function(login) {
  var digit, initTest, k, l, len, len1, unique, valeur;
  unique = [];
  for (k = 0, len = login.length; k < len; k++) {
    digit = login[k];
    initTest = true;
    for (l = 0, len1 = unique.length; l < len1; l++) {
      valeur = unique[l];
      if (valeur === digit) {
        initTest = false;
      }
    }
    if (initTest) {
      unique.push(digit);
    }
  }
  return unique;
};

getSmallImage = function(digit, callback) {
  var baseUrl, options;
  baseUrl = "https://mobile.free.fr/moncompte/";
  options = {
    method: 'GET',
    jar: true,
    url: baseUrl + "chiffre.php?pos=" + digit + "&small=1"
  };
  return request(options, function(err, res, body) {
    if (err != null) {
      callback(err);
    }
    return setTimeout(callback, 600, null);
  });
};
