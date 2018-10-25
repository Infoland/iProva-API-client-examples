# iProva API client
The iProvaAPI script file contains a javascript class to facilitate making authenticated 
calls to the iProva API in client side scripts from your site.

**REST**

When automatic logon is set to *SAML2* or *ADFS* the script will use the configured 
authentication provider to authenticate the user get a iProva user token. 
That token will then be used to identify the user in the API call.

When automatic logon is set to *Windows Authentication* the scripts will help to 
use the user's windows logon to authenticate to the REST api.

**WCF** 

The WCF endpoints all use token authentication. 
Thus for WCF calls a user-token is retreived for all authentication methods.

## Requirements
- For SAML authentication and REST: iProva **5.7** 
- For Windows authentication and WCF: iProva **5.6** 

- The scripts require the jQuery library. Supported versions are 1.5 or later.

- iProva is configured for automatic login via SAML2, ADFS or Windows authentication.

- iProva API key marked as '*API key to use for generating tokens in case the API is used via Windows authentication, SAML2 or ADFS*'.

- For Windows authentication an api-key is required.

## Setup

The iProvaAPI constructor has one argument that defines the configuration.

| name | explanation |
|--|--|
| iProvaUrl | url of the iProva instance |
| logonMethod | method to use for authenticating the user |
| version | api version |
| alwaysGetNewUserToken | whether to use a new token for every API call. |
| apiKey | iProva API key. Required when using a logon method with credentials |

**Example**
```
//prepare api client config
var config = {
    version: '1', //api version
    iProvaUrl: 'http://iprova.organisation.com', 
    logonMethod: iProvaAPI.Enumerations.LogonMethod.SAML2    
};

var apiClient = new iProvaAPI(config);
```

### Logon methods
The iProvaClient facilitaties the following authentication methods.
Which method you can use depends on which is enabled in the iProva system settings.

- **None:** No authentication; user is 'anonymous'
 
- **Cookie:** When user has already logged in to iProva. The iProva cookie is used to authenticate. <sup>1</sup> 

- **SAML2/ADFS:** Authenticates the user to the SAML2/ADFS provider that is configured in iProva for automatic logon.

- **WindowsAuthentication**: If iProva has Windows authentication enabled. The user's windows account can be used.

<sup>1. Cookie authentication can only be used to call REST api.</sup>


## Call REST api
After creating an iProvaAPI instance the REST api can be called via the **callREST** function.
The callREST accepts a single parameter object that specifies the path, method parameters and callback.

| Name		 | Explanation 
|------------|--------------------------------------------------
| path		 | api path - example: *api/versions/iprova* 
| method	 | HTTP method *GET/POST/PUT/PATCH/DELETE* 
| parameters | parameter object (for POST, PUT, PATCH, and DELETE) 
| callback	 | function to call when request is completed. Response body will be passed as parameter 

**Example**
```
restParameters = {
    path: 'api/versions/iprova',
    method: 'GET',
    parameters: null, //no options
    callback: function(version) { alert(version); }
};
apiClient.callREST(restParameters);
```


## Call WCF api
After creating an iProvaAPI instance. WCF endpoints can be called via the **callWCF** function.
The callWCF accepts a single parameter object that specifies the path, method parameters and callback.

| Name       | Explanation              
|------------|--------------------------------------------------
| endpoint   | url of the WCF endpoint
| function   | name of the function in the endpoint 
| parameters | object containing the method parameters. example: `{param1:value1, param2:value2}`  <sup>1</sup>
| callback   | function to call when request is completed. Response data will be passed as parameter 

<sup>1. Don't put objCredentials in the parameters object. It will be set automatically (unless you want to skip the automatic authentication).</sup>

**example**
```
wcfParameters = {
    endpoint: 'ExternalAPI/Portals/PortalsAPI.svc',
    function: 'GetCollections',
    parameters: { "objOptions": {} },
    callback: function(collection) {
        //process collections
    }
};
apiClient.callWCF(wcfParameters);
```
