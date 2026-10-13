import pkg from 'pg';
const { Client } = pkg;

async function run() {
  const client = new Client({
    connectionString: 'postgresql://kcarrier:kcarrier_dev_password@localhost:5433/kcarrier_jobs'
  });
  await client.connect();
  const res = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'jobs'`);
  console.log('Columns in jobs table:');
  console.log(res.rows);
  await client.end();
}

run().catch(console.error);
