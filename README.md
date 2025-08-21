# LifeNest Backend

Backend server for **LifeNest Insurance Platform**, providing APIs for managing users, policies, blogs, and transactions.

## Table of Contents
- [Features](#features)
- [Technologies](#technologies)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Features
- User Authentication (Email/Password & Firebase Google Sign-in)
- Role-based access (Admin, Agent, Customer)
- CRUD operations for Insurance Policies
- Blog management (Latest blogs, CRUD)
- Transaction management
- Secure API routes using JWT and Firebase token verification
- Stripe payment integration (optional)
- Error handling and logging

## Technologies
- Node.js
- Express.js
- MongoDB / Mongoose
- Firebase Admin SDK
- JWT (JSON Web Token)
- Stripe (for payments)
- CORS, dotenv, and other middleware

## Installation
1. Clone the repository:  
```bash
git clone https://github.com/yourusername/lifenest-backend.git
cd lifenest-backend
