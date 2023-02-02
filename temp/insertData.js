const { pool } = require("./db");


async function insertData() {
  const [filename, directory] = process.argv.slice(2);
  try {
    const res = await pool.query(
      "INSERT INTO uploads (filename, directory) VALUES ($1, $2)",
      [filename, directory]
    );
    console.log(`Added a file with the name ${filename}`);
  } catch (error) {
    console.error(error)
  }
}

insertData()