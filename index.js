var fs = require('fs');
var child_process = require('child_process');
var async = require('async');
var colors = require('colors');

colors.setTheme({
	info: 'white',
	data: 'blue',
	warning: 'yellow',
	debug: 'grey',
	error: 'red'
});

function Luo(Options) {
	var options = {
		compiler: {
			c: 'gcc',
			cpp: 'g++'
		},
		libraries: [],
		path: {
			build: 'build',
			source: 'src',
			includes: []
		},
		extension: {
			source: {
				c: 'c',
				cpp: 'cpp'
			}
		}
	};

	function error(message) {
		return new Error(message.error);
	}

	function perror(err) {
		console.trace(err);
	}

	function setOptions(src, dest) {
		for (p in src) {
			if (!src.hasOwnProperty(p))
				continue;

			if (Object.prototype.toString.call(src[p]) === '[object Object]') {
				dest[p] = dest[p] ||  {};
				setOptions(src[p], dest[p]);
			} else {
				dest[p] = src[p];
			}
		}
	}

	function readDir(path, success, fail) {
		fs.exists(path, function(exists) {
			if (exists) {
				fs.readdir(path, function(error, content) {
					if (!error) {
						var directories = [];
						var files = [];
						var parallel = [];

						content.forEach(function(e) {
							parallel.push(function(callback) {
								fs.stat(path + '/' + e, function(error, stats) {
									if (!error) {
										if (stats.isDirectory())
											directories.push(e);
										else if (stats.isFile())
											files.push(e);

										callback();
									} else {
										callback(error);
									}
								});
							});
						});

						async.parallel(parallel, function(error) {
							if (!error) {
								success({
									directories: directories,
									files: files
								});
							} else if (fail) {
								fail(error)
							}
						});
					} else if (fail)
						fail(error);
				});
			} else if (fail)  {
				fail(error('Path ' + path + ' does not exist'));
			}
		});
	}

	function readDirRecursive(path, success, fail) {
		readDir(path, function(content) {
			if (content.directories.length === 0) {
				success(content);
			} else {
				var parallel = [];

				content.directories.forEach(function(dir) {
					parallel.push(function(callback) {
						readDirRecursive(path + '/' + dir, function(subcontent) {
							subcontent.directories.forEach(function(e) {
								content.directories.push(dir + '/' + e);
							});

							subcontent.files.map(function(e) {
								content.files.push(dir + '/' + e);
							});

							callback();
						}, callback);
					});
				});

				async.parallel(parallel, function(error) {
					if (!error) {
						success(content);
					} else if (fail) {
						fail(error)
					}
				});
			}
		}, fail);
	}

	function mkdir(name, success, fail) {
		fs.mkdir(name, function(error) {
			if (!error ||  error.errno === 47)
				success();
			else if (fail)
				fail(error);
		});
	}

	function mkdirs(names, success, fail) {
		var series = [];

		names.forEach(function(name) {
			series.push(function(callback) {
				mkdir(name, callback, callback);
			});
		});

		async.series(series, function(error) {
			if (!error)
				success();
			else if (fail)
				fail(error);
		});
	}

	function getFilesByExtension(path, success, fail) {
		readDirRecursive(path, function(content) {
			var files = {};

			content.files.forEach(function(file) {
				var name = file.split('/').pop();
				var ext = name.split('.').pop();

				if (name.match(/\./) === null)
					return;

				files[ext] = files[ext] || [];
				files[ext].push(file);
			});

			success(files);
		}, fail);
	}

	function exec(cmd, params, Options, success, fail) {
		var p = child_process.spawn(options.compiler.c, params, Options);
		var stdout = '';
		var stderr = '';

		p.stdout.on('data', function(data) {
			stdout += data;
		});

		p.stderr.on('data', function(data) {
			stderr += data;
		});

		p.on('close', function(code) {
			if (code === 0) {
				success(stdout);
			} else {
				fail(stderr, code);
			}
		});
	}

	function compile(success, fail) {
		readDirRecursive(options.path.source, function(content) {
			mkdirs([options.path.build, options.path.build + '/.luo'].concat(content.directories.map(function(dir) {
				return options.path.build + '/.luo/' + dir
			})), function() {
				getFilesByExtension(options.path.source, function(files) {
					var parallel = [];

					if (files[options.extension.source.c]) {
						files[options.extension.source.c].forEach(function(file) {
							parallel.push(function(callback) {
								var params = ['-c', options.path.source + '/' + file, '-o', options.path.build + '/.luo/' + file + '.o'];

								options.path.includes.forEach(function(path) {
									params.push('-I' + path);
								});

								exec(options.compiler.c, params, undefined, function(stdout) {
									callback();
								}, function(stderr, code) {
									callback(stderr);
								});
							});
						});
					}

					if (files[options.extension.source.cpp]) {
						if (options.libraries.indexOf('stdc++') === -1)
							options.libraries.push('stdc++');

						files[options.extension.source.cpp].forEach(function(file) {
							parallel.push(function(callback) {
								var params = ['-c', options.path.source + '/' + file, '-o', options.path.build + '/.luo/' + file + '.o'];

								options.path.includes.forEach(function(path) {
									params.push('-I' + path);
								});

								exec(options.compiler.cpp, params, undefined, function(stdout) {
									callback();
								}, function(stderr, code) {
									callback(stderr);
								});
							});
						});
					}

					async.parallel(parallel, function(error) {
						if (!error) {
							success();
						} else if (fail) {
							fail(error)
						}
					});
				}, fail);
			}, fail);
		}, fail);
	}

	function link(success, fail) {
		getFilesByExtension(options.path.build + '/.luo', function(files) {
			var params = [];

			options.libraries.forEach(function(lib) {
				params.push('-l' + lib);
			});

			params = params.concat(files.o.map(function(path) {
				return options.path.build + '/.luo/' + path;
			}));

			params = params.concat(['-o', options.path.build + '/' + process.cwd().split('/').pop()]);

			exec(options.compiler.c, params, undefined, function(stdout) {
				success();
			}, fail);
		}, fail);
	}

	function build(success, fail) {
		if (!fail)
			fail = perror;

		compile(function() {
			link(function() {
				success();
			}, fail);
		}, fail);
	}

	function gccParseErrors(stderr) {
		var errors = stderr.replace(/^([\w\d\/])/gm, '<luo-new-line>$1').split('<luo-new-line>');
		errors.shift();

		errors = errors.map(function(e) {
			e = e.substring(0, e.length - 1); // new line
			var info = e.split(':');

			info = info.map(function(e) {
				return e.replace(/^\s+/, '').replace(/\s+$/, '');
			});

			return {
				file: info[0],
				line: +info[1],
				column: +info[2],
				type: info[3],
				message: info[4]
			};
		});

		return errors;
	}

	function gccColorOutput(stderr) {
		var errors = gccParseErrors(stderr);
		var count = errors.length - 1;
		var result = '';

		errors.forEach(function(e, i) {
			var caret = e.message.substr(-1);
			e.message = e.message.substring(0, e.message.length - 1);

			result += e.type.red.bold + ' ' + e.file.green.bold + ' line '.cyan.bold + (e.line.toString()).bold + '\n' + ' ' + e.message.white + caret.red.bold + (i === count ? '' : '\n');
		});

		return result;
	}

	function addLibrary(lib) {
		options.libraries.push(lib);
	}

	function addLibraries(libs) {
		options.libraries = options.libraries.concat(libs);
	}

	function publishFunction(object, name, func) {
		Object.defineProperty(object, name, {
			value: func
		});
	}

	if (Options)
		setOptions(Options, options);

	publishFunction(this, 'gccParseErrors', gccParseErrors);
	publishFunction(this, 'gccColorOutput', gccColorOutput);
	publishFunction(this, 'addLibrary', addLibrary);
	publishFunction(this, 'addLibraries', addLibraries);
	publishFunction(this, 'setOptions', setOptions);
	publishFunction(this, 'compile', compile);
	publishFunction(this, 'link', link);
	publishFunction(this, 'build', build);
}

module.exports = new Luo();