# weapp-backend-api

[![NPM version][npm-image]][npm-url] [![changelog][changelog-image]][changelog-url] [![license][license-image]][license-url]

[npm-image]: https://img.shields.io/npm/v/weapp-backend-api.svg?style=flat-square
[npm-url]: https://npmjs.org/package/weapp-backend-api
[license-image]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square
[license-url]: https://github.com/ufologist/weapp-backend-api/blob/master/LICENSE
[changelog-image]: https://img.shields.io/badge/CHANGE-LOG-blue.svg?style=flat-square
[changelog-url]: https://github.com/ufologist/weapp-backend-api/blob/master/CHANGELOG.md

统一封装微信小程序平台后端接口的调用

- 集中配置接口
- 统一发送请求
  - `sendRequest(name, options)`
- 统一处理请求的返回
- 统一异常处理
- Promise 风格
- 支持日志级别参数, 用于在调试阶段输出每个请求的信息
- 预留扩展点(继承覆盖的方式)
  - `beforeSend(requestOptions)`
  - `afterSend(requestOptions, requestResult)`
  - `ifApiSuccess(requestOptions, requestResult)`
  - `getRequestResult(requestOptions, requestResult)`
  - `commonFailStatusHandler(requestOptions, requestResult)`
  - `commonFailTip(requestOptions, requestResult)`
  - `failStatusHandler(requestOptions, requestResult)`

## 安装

```
npm install weapp-backend-api --save
```

## 使用

```javascript
import BackendApi from 'weapp-backend-api';
import Logger from 'simple-console-log-level';

var backendApi = new BackendApi({
    'getList': {
        method: 'GET',
        url: 'https://domain.com/list'
    },
    'getUser': { // RESTful
        method: 'GET',
        url: 'https://domain.com/user'
    }
}, undefined, Logger.LEVEL_WARN);

backendApi.sendRequest('getList').then(function([data]) {
    console.log(data);
}, function(requestResult) {
    console.log(requestResult);
});

// 支持 RESTful 风格
backendApi.sendRequest('getUser/1').then(function([data]) {
    console.log(data);
}, function(requestResult) {
    console.log(requestResult);
});
```

## 实现的自定义请求参数

* `_showLoading` 默认发送请求时会显示一个正在加载中的提示
* `_showLoadingMask` 默认发送请求时不开启加载中的蒙层
* `_showFailTip` 默认请求失败时会给用户提示错误消息
* `_showFailTipDuration` 接口调用出错时错误信息的显示多长时间(ms), 默认是 `wx.showToast` 的显示时间
* `_interceptDuplicateRequest` 默认不拦截重复请求
* `_cacheTtl` 缓存接口返回的数据, 设置缓存数据的存活时长(ms)