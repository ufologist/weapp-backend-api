# weapp-backend-api

[![NPM version][npm-image]][npm-url] [![changelog][changelog-image]][changelog-url] [![license][license-image]][license-url]

[npm-image]: https://img.shields.io/npm/v/weapp-backend-api.svg?style=flat-square
[npm-url]: https://npmjs.org/package/weapp-backend-api
[license-image]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square
[license-url]: https://github.com/ufologist/weapp-backend-api/blob/master/LICENSE
[changelog-image]: https://img.shields.io/badge/CHANGE-LOG-blue.svg?style=flat-square
[changelog-url]: https://github.com/ufologist/weapp-backend-api/blob/master/CHANGELOG.md

[![npm-image](https://nodei.co/npm/weapp-backend-api.png?downloads=true&downloadRank=true&stars=true)](https://npmjs.com/package/weapp-backend-api)

统一封装微信小程序平台后端接口的调用

- 集中配置接口
- 统一发送请求(`request` 和 `uploadFile`)
- 统一处理请求的返回
- 统一适配请求返回的数据格式
- 统一异常处理
- Promise 风格
  - `sendRequest(name, options, namespace).then`
- 支持日志级别参数, 用于在调试阶段输出每个请求的信息
- 预留扩展点(继承覆盖的方式)
  - `beforeSend(requestOptions)` 发送请求前的统一处理, 如果返回一个 Promise 可以阻止发送请求
  - `afterSend(requestOptions, requestResult)` 请求结束后的统一处理
  - `normalizeRequestResult(requestOptions, requestResult)` 标准化接口返回的数据格式, 方便适配各种接口返回数据格式不同的情况
  - `failStatusHandler(requestOptions, requestResult)` 针对错误状态做自定义处理
  - `commonFailStatusHandler(requestOptions, requestResult)` 当接口处理失败时通用的错误状态处理
  - `commonFailTip(requestOptions, requestResult)` 接口出错时统一弹出错误提示信息
  - `getFailTipMessage(requestOptions, requestResult)` 获取给用户的错误提示

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

## 使用 [APIDoc](https://doc.esdoc.org/github.com/ufologist/weapp-backend-api/)

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
    },
    'uploadPhoto': { // wx.uploadFile
        _type: 'uploadFile',
        url: 'https://domain.com/photo/upload'
    }
}, undefined, Logger.LEVEL_WARN);

// 调用配置好的接口
backendApi.sendRequest('getList', {
    // wx.request options
}).then(function([data]) {
    console.log(data);
}, function(requestResult) {
    console.log(requestResult);
});

// 调用没有配置的接口
backendApi.sendRequest('', {
    url: 'https://domain.com/foobar'
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

// 支持上传文件
backendApi.sendRequest('uploadPhoto', {
    filePath: '', // 例如通过 wx.chooseImage 拿到的文件路径
    name: 'file'
}).then(function([data]) {
    console.log(data);
}, function(requestResult) {
    console.log(requestResult);
});

// 支持 namespace 机制, 便于拆分接口配置
backendApi.addApiConfig('user', {
    getInfo: {
        url: 'https://domain.com/user/info'
    }
});
// 显式指定 namespace
backendApi.sendRequest('getInfo', {
    // wx.request options
}, 'user').then(function([data]) {
    console.log(data);
}, function(requestResult) {
    console.log(requestResult);
});
// 直接拼上 namespace 更简洁
backendApi.sendRequest('user.getInfo', {
    // wx.request options
}).then(function([data]) {
    console.log(data);
}, function(requestResult) {
    console.log(requestResult);
});

// 支持加载远程的接口配置, 之后的接口调用会在接口配置加载完成后才真正发送
backendApi.loadApiConfig({
    // wx.request options
    url: 'https://domain.com/api-config/abc123'
});
backendApi.sendRequest('getRemoteApiConfig', {
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
* `_type` 请求的类型, 默认通过 `request` 来发送请求, 如果是上传文件, 请设置为 `uploadFile`

## 核心逻辑流程

* 配置接口 - `new BackendApi(apiConfig)`
* 发送请求 - `sendRequest`
  * 获取调用接口的配置 - `_getRequestOptions`
  * 发送 HTTP 请求 - `$sendHttpRequest`
    * 发送请求前的统一处理 - `beforeSend`
      * 拦截重复请求 - `_interceptDuplicateRequest`
      * 获取接口缓存 - `cachedRequestResult`
      * 显示 loading 提示 - `_showLoading`
    * 发出请求 - `wx.request`
    * 将请求放入到发送中的队列 - `_addToSending`
    * 判断 HTTP 请求是否成功 - `statusCode`
    * 请求结束后的统一处理 - `afterSend`
      * 将请求从发送中的队列中移除 - `_removeFromSending`
      * 关闭 loading 提示 - `_hideLoading`
    * 请求成功 - `_successHandler`
      * 标准化接口的返回数据 - `_normalizeRequestResult` -> `normalizeRequestResult`
      * 判断接口调用是否成功 - `_ifApiSuccess`
        * 成功: 将请求结果写入缓存 - `_cacheTtl`
        * 失败: 通用的错误处理 - `commonFailStatusHandler`
    * 请求失败 - `_failHandler`
      * 标准化请求失败的数据并规范错误码
      * 通用的错误处理 - `commonFailStatusHandler`
        * 输出错误日志
        * 针对错误状态做自定义处理 - `failStatusHandler`
        * 抛出错误提示给用户 - `commonFailTip` <- `getFailTipMessage`

## 微信小程序 HTTP 请求没有实现 Cookie 机制

不过从 [`2.10.0`](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html#Object-res) 版本起, `wx.request` 的 `success` 回调方法中增加了 `cookies` 字段

* 建议使用 [weapp-cookie](https://github.com/charleslo1/weapp-cookie) 一行代码让小程序支持 cookie
  
  在底层改写了 `wx.request` 自动读取和写入 HTTP 请求中的 Cookie(遵循浏览器的机制), 应用层可以无感知使用
* 如果确实想自己实现, 建议通过 [set-cookie-parser](https://github.com/nfriedly/set-cookie-parser) 来解析 `set-cookie` 头

  ```javascript
  import setCookie from 'set-cookie-parser';

  // 解析单个 set-cookie 头的值
  // [{name: "a2", value: "a2", path: "/", expires: Date}]
  var cookies = setCookie.parse('a2=a2; Path=/; Expires=Thu, 27 Feb 2020 07:12:23 GMT');

  // 解析合并了之后的 cookie 内容(先分离成单个值)
  // ["a1=a1; Path=/", "a2=a2; Path=/; Expires=Thu, 27 Feb 2020 07:12:23 GMT", "a3=a3; Path=/"]
  var splitCookieHeaders = setCookie.splitCookiesString('a1=a1; Path=/,a2=a2; Path=/; Expires=Thu, 27 Feb 2020 07:12:23 GMT,a3=a3; Path=/');
  var cookies = setCookie.parse(splitCookieHeaders);
  ```