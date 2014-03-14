var url = require('url');
var path = require('path');

// a simple parser for http response string without status line 
function parse(source) {
    var result = {};
    var lines = source.split('\r\n');
    var line;

    var headers = {};
    // headers
    while(lines.length) {
        line = lines.shift();
        if (line) {
            line = line.split(':');
            headers[line[0]] = line[1];
        } else {
            break;
        }
    }
    result['headers'] = headers;

    // body
    result['body'] = lines.join('\r\n');

    return result;
}

var HEADER_NEED_HTTP_PREFIX = [
    'COOKIE',
    "HOST",
    "REFERER",
    "USER-AGENT",
    "CONNECTION",
    "ACCEPT",
    "ACCEPT-ENCODING",
    "ACCEPT_LANGUAGE"
];

function isNeedHttpPrefix(header) {
    return HEADER_NEED_HTTP_PREFIX.indexOf(header.toUpperCase()) > -1;
}

/**
 * phpcgi
 *
 * @param {Object} options 
 * @param {string} options.documentRoot 
 * @param {strgin} options.handler the `php-cgi` executable file path, etc：
 *      1. posix: `/usr/local/php/bin/php-cgi`
 *      2. windows: `c:\\Program Files\\PHP\\php-cgi.exe`
 */
exports = module.exports = function(options) {
    var docRoot = options.documentRoot;
    var handler = options.handler;

    return function(req, res, next) {
        req.pause();
        
        var info = url.parse(req.url);
        var scriptName = info.pathname;
        var query = info.query;
        var method = req.method;
        var scriptFileName = path.normalize(docRoot + scriptName);

        // @see: http://www.cgi101.com/book/ch3/text.html
        var headers = req.headers;
        var host = (headers.host || '').split(':');
        var env = {
            PATH: process.env.PATH,
            GATEWAY_INTERFACE: 'CGI/1.1',
            SERVER_PROTOCOL: 'HTTP/1.1',
            SERVER_ROOT: docRoot,
            DOCUMENT_ROOT: docRoot,
            REDIRECT_STATUS: 200,
            SERVER_NAME: host[0],
            SERVER_PORT: host[1] || 80,
            REDIRECT_STATUS: 200,
            SCRIPT_NAME: scriptName, 
            REQUEST_URI: scriptName,
            SCRIPT_FILENAME: scriptFileName,
            REQUEST_METHOD: method,
            QUERY_STRING: query || ''
        };
        // @see: http://en.wikipedia.org/wiki/Common_Gateway_Interface
        // @see: http://livedocs.adobe.com/coldfusion/8/htmldocs/help.html?content=Expressions_8.html
        for (var header in headers) {
            var name = header.toUpperCase().replace(/-/g, '_');
            if(isNeedHttpPrefix(header)) {
                name = 'HTTP_' + name;
            }

            env[name] = headers[header];
        }

        var child = require('child_process').spawn(
            handler || 'php-cgi',
            [],
            {
                env: env
            }
        );

        var buffer = [];

        child.on(
            'exit',
            function(code) {
                done(code);
            }
        );

        // collect data
        child.stdout.on('data', function(buf) {
            buffer.push(buf);
        });

        // pipe data into child progress
        // specially for post
        req.pipe(child.stdin);
        req.resume();

        function done(code) {
            var result = parse(buffer.join(''));

            result.headers.Status = result.headers.Status || "200 OK";
            result.statusCode = parseInt(result.headers.Status, 10); 

            next(code, result);
        }
    };
}
