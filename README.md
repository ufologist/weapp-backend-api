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
- 统一异常处理
- 预留扩展点

## 安装

```
npm install weapp-backend-api --save
```

## 使用

```javascript
import BackendApi from 'weapp-backend-api';

var backendApi = new WeappBackendApi({
    'getList': {
        method: 'GET',
        url: 'https://domain.com/list'
    }
});

backendApi.sendRequest('getList').then(function([data]) {
    console.log(data);
}, function(requestResult) {
    console.log(requestResult);
});
```