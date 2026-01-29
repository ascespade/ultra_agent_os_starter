const { getDatabaseConfig } = require('../config/database');

class DatabaseConnector {
  constructor() {
    this.config = getDatabaseConfig();
    this.client = null;
  }
  
  async connect() {
    const { type, url } = this.config;
    
    switch (type) {
      case 'postgres':
        const { Pool } = require('pg');
        this.client = new Pool({ connectionString: url });
        break;
      case 'mysql':
        const mysql = require('mysql2/promise');
        this.client = await mysql.createConnection(url);
        break;
      case 'mongodb':
        const { MongoClient } = require('mongodb');
        this.client = await MongoClient.connect(url);
        break;
      case 'redis':
        const redis = require('redis');
        this.client = redis.createClient({ url });
        break;
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
    
    console.log(`✅ Connected to ${type} database on Railway`);
    return this.client;
  }
  
  async healthCheck() {
    try {
      switch (this.config.type) {
        case 'postgres':
          await this.client.query('SELECT 1');
          break;
        case 'mysql':
          await this.client.execute('SELECT 1');
          break;
        case 'mongodb':
          await this.client.db().admin().ping();
          break;
        case 'redis':
          await this.client.ping();
          break;
      }
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

module.exports = new DatabaseConnector();
