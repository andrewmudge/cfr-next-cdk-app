const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  // Handle CORS preflight (OPTIONS) requests
  if (event.requestContext?.http?.method === 'OPTIONS' || event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: ''
    };
  }

  // Handle DELETE user request (POST with action 'deleteUser')
  if ((event.requestContext?.http?.method === 'POST' || event.httpMethod === 'POST')) {
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (err) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }
    if (body.action === 'deleteUser' && body.username) {
      try {
        const params = {
          UserPoolId: USER_POOL_ID,
          Username: body.username
        };
        const command = new AdminDeleteUserCommand(params);
        await client.send(command);
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
          body: JSON.stringify({ success: true })
        };
      } catch (error) {
        return {
          statusCode: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
          body: JSON.stringify({ error: error.message })
        };
      }
    } else {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify({ error: 'Missing action or username' })
      };
    }
  }
  try {
    let users = [];
    let paginationToken = undefined;
    do {
      const params = {
        UserPoolId: USER_POOL_ID,
        PaginationToken: paginationToken,
        Limit: 60
      };
      const command = new ListUsersCommand(params);
      const response = await client.send(command);
      users = users.concat(response.Users);
      paginationToken = response.PaginationToken;
    } while (paginationToken);

    // Map Cognito users to simplified objects
    const mappedUsers = users.map(user => {
      const attrs = Object.fromEntries(user.Attributes.map(a => [a.Name, a.Value]));
      return {
        username: user.Username,
        email: attrs.email || '',
        givenName: attrs.given_name || '',
        familyName: attrs.family_name || '',
        phoneNumber: attrs.phone_number || '',
        userStatus: user.UserStatus,
        userCreateDate: user.UserCreateDate,
        enabled: user.Enabled
      };
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ users: mappedUsers })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
