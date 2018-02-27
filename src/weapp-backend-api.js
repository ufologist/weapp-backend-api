import extend from 'extend';

/**
 * 统一封装后端接口的调用
 * 
 * - 集中配置接口
 * - 统一发送请求
 * - 统一处理请求的返回
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
     * @param apiConfig {object} 后端 HTTP 接口的配置, 将 HTTP 接口的调用视为一次远程调用(RPC)
     *        配置项是请求参数
     *        例如
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
     */
    constructor(apiConfig = {}, defaultRequestOptions = {}) {
        this.apiConfig = apiConfig;
        this.defaultRequestOptions = defaultRequestOptions;

        // 正在发送的请求
        this.sending = [];
    }
    /**
     * 统一发送(接口)请求的方法
     * 
     * @param {string} name 接口的名称
     *                      针对接口 URL 中有 path 参数的情况, 需要在 name 中加入斜杠来标识,
     *                      如果不使用这个参数, 也可以发请求, 但不推荐这么使用, 应该将所有接口都配置好
     * @param {object} options 请求参数
     * @return {Promise}
     */
    sendRequest(name, options) {
        var api;
        var requestOptions;

        if (name) {
            var _name = name;
            var urlAppend = '';

            // 针对接口 URL 中有 path 参数的情况, 例如: //domain.com/user/123
            // 需要在 name 中加入斜杠来标识, 例如: getUser/123
            // 配置映射的 URL 为: //domain.com/user, 会动态的将 name 后面的 path 参数拼接到此 URL 中
            // TODO 考虑支持这种格式: //domain.com/user/:userId/room/:roomId
            var slashIndex = name.indexOf('/');
            if (slashIndex != -1) {
                _name = name.substring(0, slashIndex);
                urlAppend = name.substring(slashIndex);
            }

            var _api = this.apiConfig[_name];
            if (_api) {
                api = extend(true, {}, _api);
                api.url = api.url + urlAppend;
            } else {
                console.warn('没有找到对应的接口配置', _name, this.apiConfig);
            }
        }

        requestOptions = extend(true, {}, this.defaultRequestOptions, api, options);
        return this.$sendHttpRequest(requestOptions);
    }
    /**
     * 发送 HTTP 请求的具体实现
     * 
     * @param {object} requestOptions 请求参数
     * @return {Promise}
     */
    $sendHttpRequest(requestOptions) {
        // 子类具体去实现
    }
}

/**
 * 统一封装微信小程序平台后端接口的调用
 * 
 * @example
 * var backendApi = new WeappBackendApi({
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
 */
class WeappBackendApi extends BackendApi {
    constructor(apiConfig = {}, defaultRequestOptions = WeappBackendApi.defaults.requestOptions) {
        super(apiConfig, defaultRequestOptions);
    }
    /**
     * 请求发送前的统一处理
     * 
     * @param {object} requestOptions 
     */
    beforeSend(requestOptions) {
        if (this.sending.length === 0) {
            this._showLoading();
        }
    }
    /**
     * 请求结束后的统一处理
     * 
     * @param {object} requestOptions 
     */
    afterSend(requestOptions) {
        if (this.sending.length === 0) {
            this._hideLoading();
        }
    }
    _showLoading() {
        wx.showLoading({
            icon: 'loading',
            title: WeappBackendApi.defaults.LOADING_MESSAGE,
            mask: true
        });
        wx.showNavigationBarLoading();
    }
    _hideLoading() {
        wx.hideLoading();
        wx.hideNavigationBarLoading();
    }
    /**
     * 发送 HTTP 请求
     * 
     * @param {object} requestOptions wx.requesst options
     * @return {Promise}
     */
    $sendHttpRequest(requestOptions) {
        return new Promise((resolve, reject) => {
            // 收到开发者服务器成功返回的回调函数
            // 注意: 收到开发者服务器返回就会回调这个函数, 不管 HTTP 状态是否为 200 也算请求成功
            // requestResult 包含的属性有: statusCode, header, data, errMsg
            requestOptions.success = function(requestResult) {
                // Determine if HTTP request successful | jQuery
                var isSuccess = requestResult.statusCode >= 200 && requestResult.statusCode < 300 || requestResult.statusCode === 304;

                if (isSuccess) {
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
            requestOptions.complete = (requestOptions) => {
                this.sending.splice(this.sending.indexOf(requestOptions), 1);
                this.afterSend(requestOptions);
            };

            this.beforeSend(requestOptions);
            wx.request(requestOptions);
            this.sending.push(requestOptions);
        }).then((requestResult) => {
            return this._successHandler(requestOptions, requestResult);
        }, (requestResult) => {
            return this._failHandler(requestOptions, requestResult);
        });
    }
    /**
     * 接口调用成功时的默认处理方法
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 返回的结果
     * @return {object|Promise}
     */
    _successHandler(requestOptions, requestResult) {
        if (this.ifApiSuccess(requestOptions, requestResult)) {
            return [this.getRequestResult(requestOptions, requestResult), requestResult];
        } else { // 业务错误
            return this.commonFailStatusHandler(requestOptions, requestResult);
        }
    }
    /**
     * 接口调用失败时的默认处理方法
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
                status: WeappBackendApi.defaults.REQUEST_HTTP_FAIL_STATUS,
                statusInfo: {
                    message: WeappBackendApi.defaults.REQUEST_HTTP_FAIL_MESSAGE,
                    detail: {
                        statusCode: requestResult.statusCode
                    }
                }
            };
        } else {
            result = {
                status: WeappBackendApi.defaults.REQUEST_API_FAIL_STATUS,
                statusInfo: {
                    message: WeappBackendApi.defaults.REQUEST_API_FAIL_MESSAGE,
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
    ifApiSuccess(requestOptions, requestResult) {
        // 接口返回的数据
        var result = requestResult.data;
        return !result.status || result.status === 0;
    }
    /**
     * 提取出接口返回的数据
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 返回的结果
     * @return {object}
     */
    getRequestResult(requestOptions, requestResult) {
        // 接口返回的数据
        var result = requestResult.data;
        return result.data;
    }
    /**
     * 当接口处理失败时通用的错误状态处理
     * 
     * 例如:
     * - 接口出错时统一弹出错误提示信息
     *   提供给用户看的消息格式参考 QQ 的错误提示消息
     *   提示消息
     *   (错误码:result.statusInfo.message)灰色字
     * - 接口出错时根据 status 做通用的错误处理(例如用户 session 超时, 引到用户重新登录)
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     * @return {Promise}
     */
    commonFailStatusHandler(requestOptions, requestResult) {
        // 接口调用失败, 输出失败的日志信息, 需要包含如下重要信息
        // * HTTP method
        // * HTTP URL
        // * 接口的参数
        // * 接口的返回状态
        // * 接口的返回数据
        var result = requestResult.data;
        console.warn('接口调用出错', requestOptions.method, requestOptions.url, requestOptions.data, result.status, requestOptions, requestResult);

        var message = result.statusInfo ? result.statusInfo.message : WeappBackendApi.defaults.FAIL_MESSAGE;
        // XXX 由于 wx.showLoading 底层就是调用的 showToast,
        // toast 实现是单例, 全局只有一个, 因此使用 showToast 会造成 loading 被关掉
        wx.showToast({
            icon: 'none',
            title: message + '\n' + '(错误码:' + result.status + ')'
        });

        this.failStatusHandler(requestOptions, requestResult);
        return Promise.reject(requestResult);
    }
    /**
     * 对错误状态的处理
     * 
     * @param {object} requestOptions wx.request options
     * @param {object} requestResult wx.request success 或者 fail 返回的结果
     */
    failStatusHandler(requestOptions, requestResult) {
        // 子类具体去实现
        // 例如
        // var result = requestResult.data;
        // if (result.status === WeappBackendApi.defaults.REQUEST_HTTP_FAIL_STATUS) {
        //     // XXX your code here
        // } else if (result.status == 401) {
        //     // XXX your code here
        // }
    }
}

WeappBackendApi.defaults = {
    LOADING_MESSAGE: '',

    FAIL_MESSAGE: '系统繁忙',

    // 接口请求失败(HTTP协议层面)时的状态码, 用于与业务状态码区分开
    REQUEST_HTTP_FAIL_STATUS: 10000,
    REQUEST_HTTP_FAIL_MESSAGE: '请求超时，请重试',

    // wx.request API 调用失败
    REQUEST_API_FAIL_STATUS: 20000,
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