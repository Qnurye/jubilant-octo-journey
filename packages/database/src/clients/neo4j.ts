import neo4j, { Driver } from 'neo4j-driver';
import config from '../config/index';
import { withRetry } from '../retry/index';

let driverInstance: Driver | null = null;

export const getNeo4jDriver = async (): Promise<Driver> => {
  if (driverInstance) {
    return driverInstance;
  }

  const uri = config.NEO4J_URI;
  const user = config.NEO4J_USER;
  const password = config.NEO4J_PASSWORD;

  driverInstance = await withRetry(async () => {
    console.log(`Connecting to Neo4j at ${uri}...`);
    
    // Create driver instance
    const driver = neo4j.driver(
      uri,
      neo4j.auth.basic(user, password)
    );

    // Verify connection
    const serverInfo = await driver.getServerInfo();
    console.log(`Connected to Neo4j: ${serverInfo.address} (${serverInfo.agent})`);
    
    return driver;
  });

  return driverInstance!;
};

export const closeNeo4jDriver = async () => {
  if (driverInstance) {
    await driverInstance.close();
    driverInstance = null;
  }
};
