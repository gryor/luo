luo
===
Builds C/C++ projects.

* Ĉolored and parsed error report

Example
===
```javascript
var luo = require('luo');

luo.addLibrary('m');

luo.build(function() {
	console.log('Success');
}, function(stderr) {
	console.error(luo.gccColorOutput(stderr));
});
```