var xml2js = require('xml2js').parseString;

var utilities = module.exports;

utilities.xml2js = function(xml) {
  return new Promise(function(resolve, reject) {
    xml2js(xml, function(err, res) {
      if (err) {
        return reject(err);
      }

      resolve(res);
    });
  }); 
};
