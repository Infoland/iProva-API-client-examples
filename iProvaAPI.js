iProvaAPI = function iProvaAPI(config)
{
	/// <summary>Helper class for call iProva API's</summary>
	/// <param name="iProvaUrl" type="string">URL of iProva</param>
	/// <param name="config" type="object">Client configuration object</param>
	/// <returns></returns>

	this._iProvaURL = config.iProvaUrl;
	this._logonMethod = config.logonMethod;
	this._alwaysGetNewUserToken = config.alwaysGetNewUserToken;
	this._version = config.version;
	this._apiKey = config.apiKey;

	if (config.logonMethod === iProvaAPI.Enumerations.LogonMethod.WindowsAuthentication && !config.apiKey)
		throw new Error('When using WindowsAuthentication an api key must be used.')

	//append trailing / if needed
	if (this._iProvaURL[this._iProvaURL.length - 1] != "/")
		this._iProvaURL += "/";

	//initiate token helper
	if (this._logonMethod !== iProvaAPI.Enumerations.LogonMethod.None)
		this._tokenHelper = new iProvaAPI.TokenHelper(this._iProvaURL, this._logonMethod);

	return this;
}

iProvaAPI.Enumerations = {};

iProvaAPI.Enumerations.LogonMethod =
	{
		"None": 0,
		"Cookie": 1,
		"WindowsAuthentication": 2,
		"ADFS": 3,
		"SAML2": 4,
		"SAML": 5		//SAML2 or ADFS (auto selects the correct variant for the AutoLoginType set in iProva)
	};

iProvaAPI.WCFCallParameters =
	{
		endpoint: '',
		function: '',
		parameters: {},
		callback: null
	}

iProvaAPI.RESTCallParameters =
	{
		method: '',
		path: '',
		parameters: {},
		callback: null
	}

iProvaAPI.prototype._ajaxError = function (jqxhr, textStatus, errorThrown)
{
	/// <summary>Handles jQuery ajax request error</summary>
	/// <param name="jqxhr" type="jqXHR">jQuery jqXHR object, which is a superset of the XMLHTTPRequest object. (http://api.jquery.com/jQuery.ajax/#jqXHR)</param>
	/// <param name="textStatus" type="string">Possible values are "timeout", "error", "abort", and "parsererror"</param>
	/// <param name="errorThrown" type="string">textual portion of the HTTP status</param>
	/// <returns></returns>

	iProvaAPI.showAjaxError(jqxhr, textStatus, errorThrown, '@@textStatus@@ during API Call.')
}

iProvaAPI.prototype.callWCF = function (callParameters, forceNewToken)
{
	/// <summary>Call WCF API function</summary>
	/// <param name="callParameters" type="iProvaAPI.WCFCallParameters">WCF function parameter object. note: don't set objCredentials, it will be set automatically.</param>
	/// <param name="forceNewToken" type="boolean">Force getting a new token, instead of re-using the previous token</param>
	/// <returns></returns>

	if (this._logonMethod == iProvaAPI.Enumerations.LogonMethod.Cookie)
	{
		throw new Error('Cookie authentication is not supported for WCF calls');
		return;
	}

	//ensure there is a parameters object
	if (!callParameters.parameters)
		callParameters.parameters = {};

	var apiCallFunction = function (callParameters, token)
	{
		//set credentials parameter if the parameters don't have it yet
		if (!callParameters.objCredentials)
		{
			if (this._logonMethod === iProvaAPI.Enumerations.LogonMethod.None)
				callParameters.parameters["objCredentials"] = { "Type": 3 }; //anonymous
			else
				callParameters.parameters["objCredentials"] = { "Type": 1, "TokenID": token };
		}

		$.ajax({
			method: "POST",
			url: this._iProvaURL + callParameters.endpoint + "/web/" + callParameters.function,
			contentType: "application/json",
			data: JSON.stringify(callParameters.parameters),
			success: function (result)
			{
				callParameters.callback(result);
			},
			error: function (jqxhr, textStatus, errorThrown)
			{
				//token expired?
				if (jqxhr.responseJSON && jqxhr.responseJSON.ErrorCode == 1014)
					this.callWCF(callParameters, true);
				else
					this._ajaxError(jqxhr, textStatus, errorThrown);

			}.bind(this)
		});
	}.bind(this, callParameters);

	//get token first is logon method is None and credentials are not already in the parameter object
	if (this._logonMethod !== iProvaAPI.Enumerations.LogonMethod.None || !callParameters.objCredentials)
	{
		if (arguments.length == 1)
			forceNewToken = false;

		forceNewToken = (forceNewToken || this.alwaysGetNewUserToken);

		this._tokenHelper.getToken(apiCallFunction, forceNewToken);
	}
	else //direct api call
	{
		apiCallFunction();
	}
}

iProvaAPI.prototype.callREST = function (callParameters, forceNewToken)
{
	/// <summary>Call REST api</summary>
	/// <param name="callParameters" type="iProvaAPI.RESTCallParameters">REST call options</param>
	/// <param name="forceNewToken" type="boolean">Force getting a new token, instead of re-using a previous token</param>
	/// <returns></returns>

	var apiCallFunction = function (callParameters, token)
	{
		$.ajax({
			method: callParameters.method,
			url: this._iProvaURL + callParameters.path,
			crossDomain: true,
			xhrFields: {
				withCredentials: (this._logonMethod === iProvaAPI.Enumerations.LogonMethod.Cookie)
			},
			beforeSend: function (request)
			{
				//if a token is set, set the token in authorization header
				if (token)
					request.setRequestHeader('Authorization', 'token ' + token);

				if (this._version)
					request.setRequestHeader("x-api-version", this._version);

				if (this._apiKey)
					request.setRequestHeader("x-api_key", this._apiKey);
			}.bind(this),
			contentType: "application/json",
			data: (callParameters.parameters ? JSON.stringify(callParameters.parameters) : null),
			success: function (result)
			{
				callParameters.callback(result);
			},
			error: function (jqxhr, textStatus, errorThrown)
			{
				//token expired?
				if (jqxhr.responseJSON && jqxhr.responseJSON.ErrorCode == 1014)
					this.callREST(callParameters, true);
				else
					this._ajaxError(jqxhr, textStatus, errorThrown);

			}.bind(this)
		});
	}.bind(this, callParameters);


	//get token first? (winauth / saml variants)
	if (this._logonMethod >= iProvaAPI.Enumerations.LogonMethod.WindowsAuthentication)
	{
		if (arguments.length == 1)
			forceNewToken = false;

		forceNewToken = (forceNewToken || this.alwaysGetNewUserToken);

		this._tokenHelper.getToken(apiCallFunction, forceNewToken);
	}
	else //direct API call
	{
		apiCallFunction();
	}
}


iProvaAPI.TokenHelper = function (iProvaUrl, logonMethod)
{
	/// <summary>TokenHelper constructor</summary>
	/// <param name="iProvaUrl" type="string">URL of iProva (with trailing /)</param>
	/// <param name="logonMethod" type="iProvaAPI.Enumerations.LogonMethod">Login method to use to identify user.</param>
	/// <returns></returns>

	this._iProvaURL = iProvaUrl;
	this._logonMethod = logonMethod;
	this._token = null;

	return this;
};

iProvaAPI.TokenHelper.prototype.getToken = function (callback, forceNewToken)
{
	/// <summary>Tries to get a token</summary>
	/// <param name="callback" type="function">Function pointer to call with token</param>
	/// <param name="forceNewToken" type="boolean">Force getting a new token, instead of re-using a previous token</param>
	/// <returns></returns>
	if (forceNewToken !== true && this._token)
	{
		callback(this._token);
	}
	else
	{
		//function to call the callback after getting a new token
		var afterTokenCallback = function (getTokenCallback, token)
		{
			//save new token
			this._token = token;
			//call the callback
			getTokenCallback(token);
		}.bind(this, callback);

		switch (this._logonMethod)
		{
			case iProvaAPI.Enumerations.LogonMethod.WindowsAuthentication:
				this._getTokenViaWinAuth(afterTokenCallback);
				break;
			case iProvaAPI.Enumerations.LogonMethod.ADFS:
				this._getTokenViaSAML(afterTokenCallback, 'adfs');
				break;
			case iProvaAPI.Enumerations.LogonMethod.SAML2:
				this._getTokenViaSAML(afterTokenCallback, 'saml2');
				break;
			case iProvaAPI.Enumerations.LogonMethod.SAML:
				this._getTokenViaSAML(afterTokenCallback, null);
				break;
		}
	}
}

iProvaAPI.TokenHelper.prototype._processSAMLRequestResponse = function (samlinfo, callback)
{
	/// <summary>Authenticates the user via the saml provider to get a token for the user. and then calls the given callback with the token.</summary>
	/// <param name="samlinfo" type="object">object with url, method and data needed to authenticate via SAML provider</param>
	/// <param name="callback" type="function">function to call when a token is obtained</param>
	/// <returns></returns>

	//create frane to execute SAML request
	var samlFrame = document.createElement('iframe');
	samlFrame.style.display = 'none';
	samlFrame.name = 'samlFrame' + iProvaAPI.TokenHelper._samlFrameCount++;

	var messageTimeout;
	var messageReceivedHandler = function (e)
	{
		try
		{
			var objData = JSON.parse(e.data);
			if (objData.iProvaToken)
			{
				window.removeEventListener('message', messageReceivedHandler);

				//remove form
                if (samlFrame.samlForm)
                    samlFrame.samlForm.parentNode.removeChild(samlFrame.samlForm);

				//remove frame
                samlFrame.parentNode.removeChild(samlFrame);
				window.clearTimeout(messageTimeout);

				callback(objData.iProvaToken);
			}
		}
		catch (e) { }
	};

	var messageTimeoutHandler = function ()
	{
		alert('Timeout while waiting for token message from iFrame, frame will be made visible after closing this alert');
		samlFrame.style.display = '';
	}

	//wait for a message that will be send from the window when user is authenticated
	window.addEventListener('message', messageReceivedHandler.bind(this));

	switch (samlinfo.method)
	{
		case 'POST':
			//create form to post to frame
			var samlForm = $('<form method="POST" />');
			samlForm.hide();
			samlForm.append($('<input name="SAMLRequest" />').val(samlinfo.post_data));
			samlForm.attr('action', samlinfo.url);
			samlForm.attr('target', samlFrame.name);
			samlForm.attr('id', samlFrame.name + '_form');

			//set reference to form to cleanup later
			samlFrame.samlForm = samlForm;
			//add frame and form to document
			document.body.appendChild(samlFrame);
			document.body.appendChild(samlForm[0]);
			//trigger form submit to start SAML process
			samlForm.submit();

			break;

		case 'GET':
			//Set frame URL to start SAML process
			samlFrame.src = samlinfo.url;
			document.body.appendChild(samlFrame);
			break;
	}

	//use timeout
	messageTimeout = window.setTimeout(messageTimeoutHandler, 30000);
}

iProvaAPI.TokenHelper.prototype._ajaxError = function (jqxhr, textStatus, errorThrown)
{
	/// <summary>Handles jQuery ajax request error</summary>
	/// <param name="jqxhr" type="jqXHR">jQuery jqXHR object, which is a superset of the XMLHTTPRequest object. (http://api.jquery.com/jQuery.ajax/#jqXHR)</param>
	/// <param name="textStatus" type="string">Possible values are "timeout", "error", "abort", and "parsererror"</param>
	/// <param name="errorThrown" type="string">textual portion of the HTTP status</param>
	/// <returns></returns>

	iProvaAPI.showAjaxError(jqxhr, textStatus, errorThrown, '@@textStatus@@ while getting token.')
}

iProvaAPI.TokenHelper.prototype._getTokenViaSAML = function (callback, variant)
{
	/// <summary>Get token for user authenticated via SAML (SAML2 or ADFS)</summary>
	/// <param name="callback" type="function">Function pointer to call with token</param>
	/// <param name="variant" type="string">(optional) Use a specific SAML variant. Possible values are 'saml2' or 'adfs'. When not set the variant the AutoLoginType set in iProva.</param>
	/// <returns></returns>

	$.ajax({
		method: "GET",
		url: this._iProvaURL + "api/saml" + (variant ? '/' + variant : ''),
		contentType: "application/json",
		crossDomain: true,
		xhrFields: {
			withCredentials: false //don't pass credentials to get SAML info request
		},
		success: function (samlinfo)
		{
			//use the saml info object to identify current user by authentication provider
			this._processSAMLRequestResponse(samlinfo, callback);

		}.bind(this),
		error: this._ajaxError.bind(this)
	});
}

iProvaAPI.TokenHelper.prototype._getTokenViaWinAuth = function (callback)
{
	/// <summary>Get token for user authenticated via Windows Authentication</summary>
	/// <param name="callback" type="function">Function pointer to call with token</param>
	/// <returns></returns>

	$.ajax({
		method: "GET",
		url: this._iProvaURL + "management/login/GetWinAuthToken.ashx",
		contentType: "text/plain",
		crossDomain: true,
		xhrFields: {
			withCredentials: true
		},
		success: function (token)
		{

			if (token != '0')
				callback(token);
			else
				alert('Could not authenticate user.');

		}.bind(this),
		error: this._ajaxError.bind(this)
	});
}

//counter to uniquely name saml authentication request iframes
iProvaAPI.TokenHelper._samlFrameCount = 0;

iProvaAPI.showAjaxError = function (jqxhr, textStatus, errorThrown, strMessageFormat)
{
	/// <summary>Shows ajax request error to user</summary>
	/// <param name="jqxhr" type="jqXHR">jQuery jqXHR object, which is a superset of the XMLHTTPRequest object. (http://api.jquery.com/jQuery.ajax/#jqXHR)</param>
	/// <param name="textStatus" type="string">Possible values are "timeout", "error", "abort", and "parsererror"</param>
	/// <param name="errorThrown" type="string">textual portion of the HTTP status</param>
	/// <param name="strMessageFormat" type="string">(optional) Error message format to use. Use @@argumentname@@ as replacement strings.</param>
	/// <returns></returns>

	var errorDetail = errorThrown;
	if (jqxhr.responseJSON && (jqxhr.responseJSON.Text || jqxhr.responseJSON.Message))
		errorDetail = jqxhr.responseJSON.Text || jqxhr.responseJSON.Message;

	//message set?
	if (arguments.length == 3)
		strMessageFormat = '@@textStatus@@ in ajax request.';

	var message = strMessageFormat.replace('@@textStatus@@', textStatus);
	alert(message);


	if (console && typeof (console.log) == 'function')
		console.log(message + (errorDetail ? '\n- ' + errorDetail : ''));
}