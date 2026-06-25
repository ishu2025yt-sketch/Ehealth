import React, { useState } from "react";
import axios from "axios";

function App() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isLogin) {
        const res = await axios.post("http://127.0.0.1:3000/api/login", {
          email: formData.email,
          password: formData.password
        });
        alert("✅ Login Success: " + res.data.message);
      } else {
        const res = await axios.post("http://127.0.0.1:3000/api/register", {
          name: formData.name,
          email: formData.email,
          password: formData.password
        });
        alert("🎉 Register Success: " + res.data.message);
      }
    } catch (err) {
      alert("❌ Error: " + (err.response?.data?.message || err.message));
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={{ color: "#61dafb" }}>{isLogin ? "Login" : "Register"}</h1>

      <form onSubmit={handleSubmit} style={styles.form}>
        {!isLogin && (
          <input
            type="text"
            name="name"
            placeholder="Enter Name"
            onChange={handleChange}
            style={styles.input}
          />
        )}
        <input
          type="email"
          name="email"
          placeholder="Enter Email"
          onChange={handleChange}
          style={styles.input}
        />
        <input
          type="password"
          name="password"
          placeholder="Enter Password"
          onChange={handleChange}
          style={styles.input}
        />

        <button type="submit" style={styles.button}>
          {isLogin ? "Login" : "Register"}
        </button>
      </form>

      <p
        onClick={() => setIsLogin(!isLogin)}
        style={{ color: "#61dafb", cursor: "pointer", marginTop: "10px" }}
      >
        {isLogin ? "Create an Account" : "Already have an account? Login"}
      </p>
    </div>
  );
}

const styles = {
  container: {
    textAlign: "center",
    paddingTop: "100px",
    backgroundColor: "#20232a",
    height: "100vh"
  },
  form: {
    display: "inline-block",
    flexDirection: "column",
    gap: "10px"
  },
  input: {
    display: "block",
    margin: "10px auto",
    padding: "10px",
    width: "250px",
    borderRadius: "5px",
    border: "1px solid #61dafb"
  },
  button: {
    padding: "10px 20px",
    borderRadius: "5px",
    backgroundColor: "#61dafb",
    color: "black",
    fontWeight: "bold",
    border: "none",
    cursor: "pointer"
  }
};

export default App;
