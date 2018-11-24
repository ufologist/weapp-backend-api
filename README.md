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
- 统一处理请求的返回
- 统一适配请求返回的数据格式
- 统一异常处理
- Promise 风格
  - `sendRequest(name, options).then`
- 支持日志级别参数, 用于在调试阶段输出每个请求的信息
- 预留扩展点(继承覆盖的方式)
  - `beforeSend(requestOptions)` 发送请求前的统一处理, 如果返回一个 Promise 可以阻止发送请求
  - `afterSend(requestOptions, requestResult)` 请求结束后的统一处理
  - `normalizeRequestResult(requestOptions, requestResult)` 标准化接口返回的数据格式, 方便适配各种接口返回数据格式不同的情况
  - `ifApiSuccess(requestOptions, requestResult)` 判断接口请求调用是否成功
  - `getFailTipMessage(requestOptions, requestResult)` 获取给用户的错误提示
  - `failStatusHandler(requestOptions, requestResult)` 对错误状态的处理
  - `commonFailStatusHandler(requestOptions, requestResult)` 当接口处理失败时通用的错误状态处理
  - `commonFailTip(requestOptions, requestResult)` 接口出错时统一弹出错误提示信息

## 调用后端接口的统一流程

### 准备

* 配置接口的参数(`apiConfig` 中的)
* 配置接口的默认参数(`defaultRequestOptions` 中的)
* 组装接口的参数(合并默认的参数/配置的参数/本次请求的参数)

### 发送

* 发送请求前的统一处理
  * 查找请求队列拦截重复请求(**不发送请求**)
  * 查找接口缓存数据, 如果存在则直接返回缓存数据(**不发送请求**)
  * 显示 loading 提示
* 发送 HTTP 请求(具体平台具体实现)
  * 将请求加入到请求队列
* 请求结束后的统一处理
  * 将请求从请求队列中移除
  * 关闭 loading 提示

### 完成

* 发送请求成功时的默认处理方法
  * 判断 `HTTP` 请求是否成功
  * 判断接口调用是否成功(需要[统一规范接口返回的数据格式](https://github.com/f2e-journey/treasure/blob/master/api.md#%E6%8E%A5%E5%8F%A3%E8%BF%94%E5%9B%9E%E7%9A%84%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84))
  * 提取出接口返回的数据(需要[统一规范接口返回的数据格式](https://github.com/f2e-journey/treasure/blob/master/api.md#%E6%8E%A5%E5%8F%A3%E8%BF%94%E5%9B%9E%E7%9A%84%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84))
  * 将接口数据写入缓存
* 发送请求失败时的默认处理方法
  * 统一展示标准的错误提示(需要[统一规范接口返回的数据格式](https://github.com/f2e-journey/treasure/blob/master/api.md#%E6%8E%A5%E5%8F%A3%E8%BF%94%E5%9B%9E%E7%9A%84%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84))
  * 统一做通用的错误处理(例如用户 `session` 超时, 引导用户重新登录)(需要[统一规范接口返回的数据格式](https://github.com/f2e-journey/treasure/blob/master/api.md#%E6%8E%A5%E5%8F%A3%E8%BF%94%E5%9B%9E%E7%9A%84%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84))

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

backendApi.sendRequest('getList', {
    // wx.request options
}).then(function([data]) {
    console.log(data);
}, function(requestResult) {
    console.log(requestResult);
});

// 支持 RESTful 风格
backendApi.sendRequest('getUser/1', {
    // wx.request options
}).then(function([data]) {
    console.log(data);
}, function(requestResult) {
    console.log(requestResult);
});
```

## 实现的自定义请求参数(options)

* `_showLoading` 默认发送请求时会显示一个正在加载中的提示
* `_showLoadingMask` 默认发送请求时不开启加载中的蒙层
* `_showFailTip` 默认请求失败时会给用户提示错误消息
* `_showFailTipDuration` 接口调用出错时错误信息显示多长的时间(ms), 默认为 `wx.showToast` 默认的显示时长
* `_interceptDuplicateRequest` 是否拦截重复请求, 默认不拦截重复请求
* `_cacheTtl` 缓存接口返回的数据, 设置缓存数据的存活时长(ms)
* `_normalizeRequestResult` 适配单个接口返回的数据以符合[标准的接口数据格式](https://github.com/f2e-journey/treasure/blob/master/api.md#%E6%8E%A5%E5%8F%A3%E8%BF%94%E5%9B%9E%E7%9A%84%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84)

## 核心逻辑流程

* `new BackendApi()`
* `sendRequest`
  * `_getRequestOptions`
  * `$sendHttpRequest`
    * `beforeSend`
    * 发送请求
    * `_addToSending`
    * `afterSend`
      * `_successHandler`
        * `ifApiSuccess`
        * `getRequestResult`
          * `_getNormalizeRequestResult`
            * `normalizeRequestResult`
        * `commonFailStatusHandler`
          * `failStatusHandler`
          * `commonFailTip`
            * `getFailTipMessage`
      * `_failHandler`