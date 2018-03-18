'use strict';

var fs = require('fs'),
    path = require('path'),
    File = require('vinyl'),
    vfs = require('vinyl-fs'),
    _ = require('lodash'),
    concat = require('concat-stream'),
    GithubSlugger = require('github-slugger'),
    createFormatters = require('documentation').util.createFormatters,
    LinkerStack = require('documentation').util.LinkerStack,
    hljs = require('highlight.js');

function isFunction(section) {
  return section.kind === 'function' || section.kind === 'typedef' && section.type.type === 'NameExpression' && section.type.name === 'Function';
}

module.exports = function (comments, config) {

  fs.readFile('jsdoc.json', 'utf8', function(err, contents) {
    var jsConfig = JSON.parse(contents);
    config.title = jsConfig.title;
    config.description = jsConfig.description;
    config.issue = jsConfig.issue;
  });
  
  var linkerStack = new LinkerStack(config).namespaceResolver(comments, function (namespace) {
    var slugger = new GithubSlugger();
    return '#' + slugger.slug(namespace);
  });

  var formatters = createFormatters(linkerStack.link);

  hljs.configure(config.hljs || {});

  var sharedImports = {
    imports: {
      slug(str) {
        var slugger = new GithubSlugger();
        return slugger.slug(str);
      },
      shortSignature(section) {
        var prefix = '';
        if (section.kind === 'class') {
          prefix = 'new ';
        } else if (!isFunction(section)) {
          return section.name;
        }
        return prefix + section.name + formatters.parameters(section, true);
      },
      signature(section) {
        var returns = '';
        if (!isFunction(section)) {
          return section.name;
        }
        if (section.returns.length) {
          returns = ': ' + formatters.type(section.returns[0].type);
        }
        return section.name + formatters.parameters(section) + returns;
      },
      md(ast, inline) {
        if (inline && ast && ast.children.length && ast.children[0].type === 'paragraph') {
          ast = {
            type: 'root',
            children: ast.children[0].children.concat(ast.children.slice(1))
          };
        }
        return formatters.markdown(ast);
      },
      formatType: formatters.type,
      autolink: formatters.autolink,
      highlight(example) {
        if (config.hljs && config.hljs.highlightAuto) {
          return hljs.highlightAuto(example).value;
        }
        return hljs.highlight('js', example).value;
      }
    }
  };

  sharedImports.imports.renderSection = _.template(fs.readFileSync(path.join(__dirname, 'section.html'), 'utf8'), sharedImports);

  var pageTemplate = _.template(fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), sharedImports);

  // push assets into the pipeline as well.
  return new Promise(function (resolve) {
    vfs.src([__dirname + '/assets/**'], { base: __dirname }).pipe(concat(function (files) {
      resolve(files.concat(new File({
        path: 'index.html',
        contents: new Buffer(pageTemplate({
          docs: comments,
          config
        }), 'utf8')
      })));
    }));
  });
};