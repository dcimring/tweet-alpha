module.exports = {
  apps: [
    {
      name: "tweet-alpha-worker",
      script: "main.py",
      interpreter: "python",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        PYTHONUNBUFFERED: "1"
      }
    }
  ]
};
