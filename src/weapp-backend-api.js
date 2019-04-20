import extend from 'extend';
import md5 from 'blueimp-md5';
import Logger from 'simple-console-log-level';

import SimpleStorage from 'weapp-simple-storage';

/**
 * 统一封装后端接口的调用
 * 
 * - 集中配置接口
 * - 统一发送请求
 * - 统一处理请求的返回
 * - 统一适配请求返回的数据格式
 * - 统一异常处理
 * - 预留扩展点
 * 
 * 此类是抽象类, 其他平台继承此类来实现具体发送请求的功能
 * 例如:
 * BackendApi -> WeappBackendApi(微信小程序平台的封装)
 *            -> Web$BackendApi(Web平台, 基于jQuery/Zepto的封装)
 */
class BackendApi {
    /**
     * @param {object} apiConfig 后端 HTTP 接口的配置, 将 HTTP 接口的调用视为一次远程调用(RPC)
     *        配置项是接口名称和请求参数的映射
     *        例如
     *        ```javascript
     *        {
     *            'getList': {
     *                method: 'GET',
     *                url: 'https://domain.com/list'
     *            },
     *            'getDetail': {
     *                method: 'GET',
     *                url: 'https://domain.com/detail'
     *            }
     *        }
     *        ```
     * @param {object} defaultRequestOptions 默认的请求参数
     * @param {number} loggerLevel 日志级别, 默认为 Logger.LEVEL_WARN 级别
     *                 TODO: 如果微信小程序支持获取当前运行的版本(开发版/体验版/线上版),
     *                 那么日志级别的默认值可以根据运行的版本来判断, 非线上版本自动为 TRACE 级别
     */
    constructor(apiConfig = {}, defaultRequestOptions = {}, loggerLevel = Logger.LEVEL_WARN) {
        this.apiConfig = apiConfig;
        this.defaultRequestOptions = defaultRequestOptions;

        // 正在发送的请求
        this.sending = {};

        // 是否在加载接口配置
        this.loading = false;
        // 等待发送的请求
        this.stalled = [];

        this.logger = new Logger({
            level: loggerLevel,
            prefix: '[backend-api]'
        });
    }

    /**
     * 添加一组后端 HTTP 接口的配置
     * 
     * @param {string | object} [namespace] 给接口名添加 namespace, 例如: 给 'getUser' 添加 'user' 的 namespace, 接口名会变为 'user.getUser'; 如果参数为 object 类型, 则表示直接添加接口配置, 不设置 namespace
     * @param {object} apiConfig
     * @return {BackendApi} this
     */
    addApiConfig(namespace, apiConfig) {
        var _apiConfig;

        if (arguments.length === 1) {
            _apiConfig = namespace;
        } else {
            if (namespace) {
                _apiConfig = {};
                for (var name in apiConfig) {
                    _apiConfig[namespace + '.' + name] = apiConfig[name];
                }
            } else {
                _apiConfig = apiConfig;
            }
        }

        // 可能存在覆盖接口配置的情况
        for (var name in _apiConfig) {
            if (this.apiConfig[name]) {
                this.logger.warn('覆盖了接口的配置', name, _apiConfig[name], this.apiConfig[name]);
            }
        }

        extend(this.apiConfig, _apiConfig);
        return this;
    }

    /**
     * 发送请求前的统一处理
     * 
     * @abstract
     * @param {object} requestOptions
     * @return {undefined|Promise}
     */
    beforeSend(requestOptions) {}
    /**
     * 请求结束后的统一处理
     * 
     * @abstract
     * @param {object} requestOptions
     * @param {object} requestResult
     */
    afterSend(requestOptions, requestResult) {}
    
    /**
     * 统一发送(接口)请求的方法
     * 
     * @param {string} name 接口的名称
     * @param {object} [options={}] 请求参数
     * @param {string} [namespace=''] 接口名的 namespace
     * @return {Promise}
     */
    sendRequest(name, options = {}, namespace = '') {
        // 如果还在加载接口配置, 则延迟执行接口的请求
        if (this.loading) {
            var dfd = new Deferred();
            this.stalled.push(dfd);

            return dfd.then(() => {
                var requestOptions = this._getRequestOptions(name, options, namespace);
                return this.$sendHttpRequest(requestOptions);
            });
        } else {
            var requestOptions = this._getRequestOptions(name, options, namespace);
            return this.$sendHttpRequest(requestOptions);
        }
    }

    /**
     * 加载后端 HTTP 接口的配置
     * 
     * @param {object} requestOptions 请求参数
     * @return {Promise}
     */
    loadApiConfig(requestOptions) {
        this.loading = true;
        return this.$sendHttpRequest(requestOptions).then(([data, requestResult]) => {
            this.addApiConfig(data);

            // 激活等待发送的请求
            this.stalled.forEach(function(dfd) {
                dfd.resolve();
            });
            this.stalled.length = 0;

            this.loading = false;

            return [data, requestResult];
        }, () => {
            this.loading = false;
        });
    }

    /**
     * 发送 HTTP 请求的具体实现
     * 
     * @abstract
     * @param {object} requestOptions 请求参数
     * @return {Promise}
     */
    $sendHttpRequest(requestOptions) {
        // 子类具体去实现
        return new Promise(function(resolve, reject) {
            reject('需要子类去实现发送 HTTP 请求');
        });
    }

    /**
     * 获取请求的参数
     * 
     * @param {string} name 接口的名称, 既配置在 `apiConfig` 中的 key
     *                      针对接口 URL 中有 path 参数的情况, 需要在 name 中加入斜杠来标识,
     *                      如果不使用这个参数, 也可以发请求, 但不推荐这么使用, 应该将所有接口都配置好
     * @param {object} options 请求参数
     * @param {string} namespace 接口名的 namespace
     * @return {object}
     */
    _getRequestOptions(name, options, namespace) {
        var api;

        if (name) {
            var _name = name;
            var urlAppend = '';

            // 针对接口 URL 中有 path 参数的情况, 例如: //domain.com/user/123
            // 需要在传入的 name 中加入斜杠来标识, 例如传入的 name 为: getUser/123
            // getUser 接口的配置与一般的配置一样
            // 'getUser': {
            //     url: '//domain.com/user'
            // }
            // 会先根据斜杠提取出注册在接口配置中的名字: getUser,
            // 再取出 getUser 注册时的 URL, 将斜杠之后的 path 拼接到此 URL 中
            // TODO 考虑支持这种格式: //domain.com/user/:userId/room/:roomId
            var slashIndex = name.indexOf('/');
            if (slashIndex != -1) {
                _name = name.substring(0, slashIndex);
                urlAppend = name.substring(slashIndex);
            }

            if (namespace) {
                _name = namespace + '.' + _name;
            }
            var _api = this.apiConfig[_name];
            if (_api) {
                api = extend(true, {}, _api);
                api.url = api.url + urlAppend;
            } else {
                this.logger.warn('没有找到对应的接口配置', _name, this.apiConfig);
            }
        } else {
            this.logger.warn('没有配置接口', options);
        }

        return extend(true, {}, this.defaultRequestOptions, api, options);
    }

    /**
     * 标准化接口返回的数据格式, 方便适配各种接口返回数据格式不同的情况
     * 
     * 标准格式为:
     * ```javascript
     * {
     *     "data": {},
     *     "status": 0,
     *     "statusInfo": {
     *         "message": "给用户的提示信息",
     *         "detail": "用于排查错误的详细错误信息"
     *     }
     * }
     * ```
     * 
     * @param {any} requestOptions
     * @param {any} requestResult
     * @return {any}
     * @see https://github.com/f2e-journey/treasure/blob/master/api.md#%E6%8E%A5%E5%8F%A3%E8%BF%94%E5%9B%9E%E7%9A%84%E6%95%B0%E6%8D%AE%E7%BB%93%E6%9E%84
     */
    normalizeRequestResult(requestOptions, requestResult) {
        return requestResult;
    }
}

/**
 * 延迟执行
 * 
 * @see jQuery.Deferred
 */
class Deferred {
    constructor() {
        this._state = 'pending';

        this._resolve = null;
        this._reject = null;

        this._promise = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });
    }
    /**
     * @return {string}
     * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise#Description
     */
    state() {
        return this._state;
    }
    /**
     * @return {Promise}
     */
    promise() {
        return this._promise;
    }
    /**
     * 
     * @param {Function} onFulfilled 
     * @param {Function} onRejected 
     * @return {Promise}
     */
    then(onFulfilled, onRejected) {
        return this._promise.then(onFulfilled, onRejected);
    }
    /**
     * 
     * @param {*} value 
     */
    resolve(value) {
        this._resolve(value);
        this._state = 'fulfilled';
    }
    /**
     * 
     * @param {*} reason 
     */
    reject(reason) {
        this._reject(reason);
        this._state = 'rejected';
    }
}

/**
 * 统一封装微信小程序平台后端接口的调用
 * 
 * @example
 * ```javascript
 * import BackendApi from 'weapp-backend-api';
 * 
 * var backendApi = new BackendApi({
 *     'getList': {
 *         method: 'GET',
 *         url: 'https://domain.com/list'
 *     }
 * });
 * backendApi.sendRequest('getList').then(function([data]) {
 *     console.log(data);
 * }, function(requestResult) {
 *     console.log(requestResult);
 * });
 * ```
 */
class WeappBackendApi extends BackendApi {
    constructor(apiConfig, defaultRequestOptions = WeappBackendApi.defaults.requestOptions, loggerLevel) {
        super(apiConfig, defaultRequestOptions, loggerLevel);

        this.simpleStorage = new SimpleStorage({
            name: 'backend-api-cache',
            loggerLevel: loggerLevel
        });
    }

    /**
     * 内置如下功能
     * - 查询请求队列拦截重复请求(不发送请求)
     * - 获取接口缓存数据的机制, 存在缓存数据则直接读取缓存数据(不发送请求)
     * - 显示 loading 提示
     * 
     * @override
     * @return {undefined|Promise} 如果返回 Promise 则不会去发送请求
     */
    beforeSend(requestOptions) {
        var cachedRequestResult = this.simpleStorage.get(this._getRequestInfoHash(requestOptions));

        if (this._isSending(requestOptions) && requestOptions._interceptDuplicateRequest) {
            return this._interceptDuplicateRequest(requestOptions);
        } else if (cachedRequestResult) {
            this.logger.log('----------------------');
            this.logger.log('from cache');
            this.logger.log('----------------------');
            return Promise.resolve(cachedRequestResult);
        } else { // 前面的请求可能没有开启 loading, 因此不能判断 !this._isAnySending()
            this._showLoading(requestOptions);
        }
    }

    /**
     * 拦截重复请求
     * 
     * @param {object} requestOptions
     * @return {Promise}
     */
    _interceptDuplicateRequest(requestOptions) {
        var requestInfoHash = this._getRequestInfoHash(requestOptions);

        this.logger.warn('拦截到重复请求', requestInfoHash, this.sending[requestInfoHash], this.sending);
        this.logger.warn('----------------------');

        // 返回一个 pending 状态的 Promise, 阻止发送请求且不会触发任何回调
        return new Promise(function() {});
    }

    /**
     * 内置如下功能
     * - 清理请求队列
     * - 关闭 loading 提示
     * 
     * @override
     */
    afterSend(requestOptions, requestResult) {
        this._removeFromSending(requestOptions);

        if (!this._isAnySending(true)) {
            this._hideLoading(requestOptions);
        }
    }

    _showLoading(requestOptions) {
        if (requestOptions._showLoading !== false) {
            wx.showLoading({
                icon: 'loading',
                title: WeappBackendApi.defaults.LOADING_MESSAGE,
                mask: requestOptions._showLoadingMask
            });
        }
        // 即使设置为不显示 loading 提示, 但顶部的 loading 提示还是要给出的,
        // 因为发送了请求出去, 总要给予一定的反馈信息(例如移动网络有数据交互时的提示)
        wx.showNavigationBarLoading();
    }

    _hideLoading(requestOptions) {
        wx.hideLoading();
        wx.hideNavigationBarLoading();
    }

    /**
     * 发送 HTTP 请求
     * 
     * @override
     * @param {object} [requestOptions] 扩展了 wx.requesst 的 options
     * @param {boolean} [requestOptions._showLoading=true] 是否显示 loading 提示
     * @param {boolean} [requestOptions._showLoadingMask=false] 是否显示 loading 提示的 mask
     * @param {boolean} [requestOptions._interceptDuplicateRequest=false] 是否拦截重复请求
     * @param {boolean} [requestOptions._showFailTip=true] 接口调用出错时是否给用户提示错误消息
     * @param {number} [requestOptions._showFailTipDuration] 接口调用出错时错误信息的显示多长时间(ms)
     * @param {number} [requestOptions._cacheTtl] 缓存的存活时间(ms)
     * @param {Function} [requestOptions._normalizeRequestResult] 标准化接口返回的数据格式
     * @param {string} [requestOptions._type='request'] 请求的类型: `request` | `uploadFile`
     */
    $sendHttpRequest(requestOptions) {
        // 因为调用过 wx.request(requestOptions) 之后, 请求的 URL 会被微信小程序的 API 改写,
        // 即 requestOptions.url 参数会被改写,
        // 例如原来的 URL 是: https://domian.com/a  data 是 {a:1}
        // 那么 data 会被追加到 URL 上, 变成: https://domian.com/a?a=1
        // 由于我们计算同一个请求的签名是根据 URL 来的, 如果前后 URL 不一致, 就会造成无法辨别出重复请求
        // 因此这里我们需要保存原始的 URL 参数
        requestOptions._url = requestOptions.url;

        var promise = null;
        var beforeSendResult = this.beforeSend(requestOptions);
        if (beforeSendResult) {
            promise = beforeSendResult;
        } else {
            promise = new Promise((resolve, reject) => {
                // 收到开发者服务器成功返回的回调函数
                // 注意: 收到开发者服务器返回就会回调这个函数, 不管 HTTP 状态是否为 200 也算请求成功
                // requestResult 包含的属性有: statusCode, header, data, errMsg
                requestOptions.success = function(requestResult) {
                    // Determine if HTTP request successful | jQuery
                    var isHttpRequestSuccess = requestResult.statusCode >= 200 && requestResult.statusCode < 300 || requestResult.statusCode === 304;

                    if (isHttpRequestSuccess) {
                        resolve(requestResult);
                    } else { // HTTP 请求失败
                        reject(requestResult);
                    }
                };
                // 接口调用失败的回调函数
                // 这个指 wx.request API 调用失败的情况,
                // 例如没有传 url 参数或者传入的 url 格式错误之类的错误情况
                // 这时不会有 statusCode 字段, 会有 errMsg 字段
                requestOptions.fail = function(requestResult) {
                    reject(requestResult);
                };

                // 发出请求
                if (requestOptions._type === 'uploadFile') { // 上传文件
                    wx.uploadFile(requestOptions);
                } else { // 其他请求
                    wx.request(requestOptions);
                }

                this._addToSending(requestOptions);
            });
        }

        return promise.then((requestResult) => {
            // 请求结束后的统一处理如果放在 complete 回调中就不方便实现重写请求返回的数据
            // 例如接口返回的数据是加密的, 需要统一在 afterSend 中封装解密的逻辑, 改写请求返回的数据,
            // 做到上层对数据的解密无感知
            this.afterSend(requestOptions, requestResult);
            return this._successHandler(requestOptions, requestResult);
        }, (requestResult) => {
            this.afterSend(requestOptions, requestResult);
            return this._failHandler(requestOptions, requestResult);
        });
    }

    /**
     * 获取一个请求的关键信息
     * 
     * - method
     * - url
     * - data
     * 
     * @param {object} requestOptions 
     * @return {string} 请求关键信息组合的 MD5 值
     */
    _getRequestInfoHash(requestOptions) {
        var data = '';
        if (requestOptions.data) {
            try {
                data = JSON.stringify(requestOptions.data);
            } catch (error) {
                data = requestOptions.data.toString();
                this.logger.warn('获取一个请求数据的 JSON 字符串失败', requestOptions.data, error);
            }
        }

        var requestInfo = requestOptions.method + ' ' + requestOptions._url + ' ' + data;

        var requestInfoHash = requestInfo;
        try {
            requestInfoHash = md5(requestInfo);
        } catch (error) {
            this.logger.warn('获取一个请求的关键信息的 MD5 失败', requestInfo, error);
        }

        return requestInfoHash;
    }

    /**
     * 将请求放入到发送中的队列中
     * 
     * @param {object} requestOptions 
     */
    _addToSending(requestOptions) {
        this.sending[this._getRequestInfoHash(requestOptions)] = requestOptions;
    }
    /**
     * 将请求从发送中的队列中移除出来
     * 
     * @param {object} requestOptions 
     */
    _removeFromSending(requestOptions) {
        var requestInfoHash = this._getRequestInfoHash(requestOptions);
        var result = delete this.sending[requestInfoHash];
        if (!result) {
            this.logger.warn('将请求从发送中的队列中移除失败', requestInfoHash, requestOptions);
        }
    }
    /**
     * 某个请求是否正在发送中
     * 
     * @param {object} requestOptions
     * @return {boolean}
     */
    _isSending(requestOptions) {
        return this.sending.hasOwnProperty(this._getRequestInfoHash(requestOptions));
    }
    /**
     * 是不是有正在发送中的请求
     * 
     * @param {boolean} excludeNoLoading 排除队列中没有开启 loading 的请求, 即 `_showLoading` 参数为 false 的请求
     * @return {boolean}
     */
    _isAnySending(excludeNoLoading) {
        var sendingCount = 0;

        if (excludeNoLoading) {
            for (var key in this.sending) {
                var requestOptions = this.sending[key];
                if (requestOptions._showLoading !== false) {
                    sendingCount += 1;
                }
            }
        } else {
            sendingCount = Object.keys(this.sending).length;
        }

        return sendingCount !== 0;
    }

    /**
     * 接口调用成功时的默认处理方法
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 返回的结果
     * @return {object|Promise}
     */
    _successHandler(requestOptions, requestResult) {
        this._normalizeRequestResult(requestOptions, requestResult);
        var result = requestResult.data;

        if (this._ifApiSuccess(requestOptions, requestResult)) {
            this.logger.log(requestOptions.method, requestOptions.url, requestOptions.data,
                            requestOptions, requestResult);
            this.logger.log('----------------------');

            if (requestOptions._cacheTtl >= 0) {
                var requestInfoHash = this._getRequestInfoHash(requestOptions);
                if (!this.simpleStorage.has(requestInfoHash)) {
                    this.simpleStorage.set(requestInfoHash, requestResult, {
                        ttl: requestOptions._cacheTtl
                    });
                }
            }

            return [
                // 只返回标准接口数据格式中的数据
                result ? result.data : result,
                requestResult
            ];
        } else { // 业务错误
            if (!result) {
                requestResult.data = result = {};
            }
            result._errorType = 'B';
            return this.commonFailStatusHandler(requestOptions, requestResult);
        }
    }

    /**
     * 接口调用失败时的默认处理方法
     * 
     * 接口错误码规范
     * -------------
     * 根据发送请求的最终状态定义错误的分类
     * - 发送失败(即请求根本就没有发送出去)
     * - 发送成功
     *   - HTTP 异常状态(例如 404/500...)
     *   - HTTP 正常状态(例如 200)
     *     - 接口调用成功
     *     - 接口调用失败(业务错误, 即接口规范中 status 非 0 的情况)
     * 
     * 错误码可不固定长度, 整体格式为: 字母+数字
     * 字母作为错误类型, 可扩展性更好, 数字建议划分区间来细分错误
     * 例如:
     * - A for API: API 调用失败(请求发送失败)的错误, 例如 A100 表示 URL 非法
     * - H for HTTP, HTTP 异常状态的错误, 例如 H404 表示 HTTP 请求404错误
     * - B for backend or business, 接口调用失败的错误, 例如 B100 业务A错误, B200 业务B错误
     * - C for Client: 客户端错误, 例如 C100 表示解析 JSON 失败
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     * @param {Promise}
     */
    _failHandler(requestOptions, requestResult) {
        var result = {};

        // 如果 wx.requet API 调用是成功的, 则一定会有 statusCode 字段
        if (typeof requestResult.statusCode != 'undefined') {
            result = {
                status: requestResult.statusCode,
                _errorType: 'H',
                statusInfo: {
                    message: WeappBackendApi.defaults.REQUEST_HTTP_FAIL_MESSAGE,
                    detail: {
                        requestOptions: requestOptions,
                        requestResult: requestResult.statusCode
                    }
                }
            };
        } else {
            var message = WeappBackendApi.defaults.REQUEST_API_FAIL_MESSAGE;
            var status = WeappBackendApi.defaults.REQUEST_API_FAIL_STATUS;

            if (requestResult.errMsg) {
                // 通过 errMsg 来生成不同的 status 值, 即方便一眼就能够知道出了什么错误
                var errMsgDetail = requestResult.errMsg.replace('request:fail ', '');
                if (errMsgDetail) {
                    message = errMsgDetail;
                    status = errMsgDetail.charCodeAt(0);
                }
            }

            result = {
                status: status,
                _errorType: 'A',
                statusInfo: {
                    message: message,
                    detail: {
                        errMsg: requestResult.errMsg
                    }
                }
            };
        }

        requestResult.data = result;
        return this.commonFailStatusHandler(requestOptions, requestResult);
    }

    /**
     * 判断接口请求调用是否成功
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 返回的结果
     * @return {boolean}
     */
    _ifApiSuccess(requestOptions, requestResult) {
        // 接口返回的数据
        var result = requestResult.data;
        var isApiSuccess = false;
        if (result) {
            isApiSuccess = !result.status || result.status == 0;
        }
        return isApiSuccess;
    }

    /**
     * 标准化接口的返回数据, 会改写 `requestResult.data` 的内容
     * 
     * @param {object} requestOptions 
     * @param {object} requestResult 
     */
    _normalizeRequestResult(requestOptions, requestResult) {
        var _normalizeRequestResult = requestOptions._normalizeRequestResult ?
                                      requestOptions._normalizeRequestResult : this.normalizeRequestResult;

        // wx.uploadFile 返回的数据是 string 类型, 需要解析为对象
        if (requestOptions._type === 'uploadFile') {
            try {
                requestResult.data = JSON.parse(requestResult.data);
            } catch (error) {
                this.logger.warn('解析 wx.uploadFile 返回的数据出错', requestOptions, requestResult);
            }
        }

        var result = _normalizeRequestResult.apply(this, [requestOptions, requestResult.data]);
        requestResult.data = result;
    }

    /**
     * 当接口处理失败时通用的错误状态处理
     * 
     * 例如:
     * - 接口出错时统一弹出错误提示信息
     * - 接口出错时根据 status 做通用的错误处理(例如用户 session 超时, 引到用户重新登录)
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     * @return {Promise}
     */
    commonFailStatusHandler(requestOptions, requestResult) {
        // 接口调用失败, 输出失败的日志信息, 需要包含如下重要信息
        // - HTTP method
        // - HTTP URL
        // - 接口的参数
        // - 接口的返回状态
        // - 接口的返回数据
        this.logger.warn(`接口调用出错(${this._getErrorCode(requestResult.data)})`,
                         requestOptions.method, requestOptions.url, requestOptions.data,
                         requestOptions, requestResult);
        this.logger.warn('----------------------');

        this.failStatusHandler(requestOptions, requestResult);
        this.commonFailTip(requestOptions, requestResult);
        return Promise.reject(requestResult);
    }

    /**
     * 针对错误状态做自定义处理
     * 
     * @abstract
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     */
    failStatusHandler(requestOptions, requestResult) {
        // 子类具体去实现
        // 例如
        // var result = requestResult.data;
        // if (result.status === WeappBackendApi.defaults.REQUEST_API_FAIL_STATUS) {
        //     // XXX your code here
        // } else if (result.status == 401) { // 例如用户未登录统一跳转到登录页
        //     // XXX your code here
        // }
    }

    /**
     * 接口出错时统一弹出错误提示信息
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     */
    commonFailTip(requestOptions, requestResult) {
        // 在一些场景下需要, 例如提示用户登录的时候, 不希望看见一个错误提示, 或者想自定义错误提示的时候
        if (requestOptions._showFailTip !== false) {
            var message = this.getFailTipMessage(requestOptions, requestResult);

            // XXX 由于 wx.showLoading 底层就是调用的 showToast,
            // toast 实现是单例, 全局只有一个, 因此使用 showToast 会造成 loading 被关掉
            var toastOptions = {
                icon: 'none',
                title: message
            };

            if (typeof requestOptions._showFailTipDuration !== 'undefined') {
                toastOptions.duration = requestOptions._showFailTipDuration;
            }

            wx.showToast(toastOptions);
        }
    }

    /**
     * 获取错误码
     * 
     * @param {object} result 标准的接口数据
     * @return {string}
     */
    _getErrorCode(result) {
        return `${result._errorType}${result.status ? result.status : ''}`;
    }

    /**
     * 获取给用户的错误提示
     * 
     * 例如: 提供给用户看的消息格式参考 QQ 的错误提示消息
     * 提示消息
     * (错误码: xxx)灰色字
     * 
     * @param {object} requestOptions 
     * @param {object} requestResult 
     * @return {string}
     */
    getFailTipMessage(requestOptions, requestResult) {
        var result = requestResult.data;

        var message = (result.statusInfo && result.statusInfo.message) ?
                      result.statusInfo.message : WeappBackendApi.defaults.FAIL_MESSAGE;

        return `${message}\n(错误码:${this._getErrorCode(result)})`;
    }
}

WeappBackendApi.defaults = {
    LOADING_MESSAGE: '',

    FAIL_MESSAGE: '系统繁忙',

    // 接口请求失败(HTTP协议层面)时的状态码, 用于与业务状态码区分开
    REQUEST_HTTP_FAIL_MESSAGE: '请求超时，请重试',

    // wx.request API 调用失败
    REQUEST_API_FAIL_STATUS: 1,
    REQUEST_API_FAIL_MESSAGE: '请求失败，请重试',

    // 默认的请求参数
    requestOptions: {
        header: {
            'content-type': 'application/x-www-form-urlencoded'
        },
        dataType: 'json'
    }
};

export default WeappBackendApi;