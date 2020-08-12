const AWS = require('aws-sdk');
const {
    DynamoDB
} = require('rxjs-dynamodb-client');
const {
    DynamoDbStore
} = require('../models');

class App {
    constructor() {
        this.dynamoDb = new DynamoDB({
            client: new AWS.DynamoDB({
                endpoint: 'http://localhost:9090',
                region: 'us-east-1'
            })
        });

        this.store = new DynamoDbStore({
            dynamoDb: this.dynamoDb,
            tableName: 'specGraph',
            ttl: 365 * 24 * 60 * 60 * 1000 // 1 year
        });
    }
}

module.exports = new App();