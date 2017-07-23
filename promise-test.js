var Promise = require('./src');

var timeTestFn = function(text,err){
  return new Promise(function(res,rej){
    setTimeout(function(){
      if(err)
        return rej(err);

      res(text);
    },1000);
  });
}

// setInterval(()=>{
//   console.log(x);
// },0);

var x = timeTestFn(undefined)
.then(function(d){
  console.log(1,d);
  return timeTestFn('a');
})
// .then(function(d){
//   console.log(2,d);
//   return d;
// })
// .catch(console.log)