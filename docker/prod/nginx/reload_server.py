#!/usr/bin/env python3
from flask import Flask, jsonify, request
import subprocess

app = Flask(__name__)

@app.route('/reload', methods=['POST'])
def reload_nginx():
    try:
        # Issue the command to reload NGINX.
        subprocess.check_call(["nginx", "-s", "reload"])
        return jsonify({"status": "success", "message": "Nginx reloaded"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    # Listen on all interfaces at port 81.
    app.run(host='0.0.0.0', port=81)