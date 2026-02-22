# Step 1: Use an official Node.js runtime as a parent image
# We use Alpine Linux because it is very lightweight and secure
FROM node:20-alpine

# Step 2: Set the working directory inside the container
# This is where our app will live inside the Docker container
WORKDIR /usr/src/app

# Step 3: Copy package.json and package-lock.json (if available)
# We do this before copying the rest of the code to leverage Docker cache
# If package.json hasn't changed, Docker won't reinstall dependencies
COPY package*.json ./

# Step 4: Install the project dependencies
RUN npm install

# Step 5: Copy the rest of your application's source code
# The .dockerignore file will prevent node_modules and .env from being copied again
COPY . .

# Step 6: Expose the port the app runs on
# The server.js uses process.env.PORT or defaults to 4000
EXPOSE 4000

# Step 7: Define the command to run your app
# This corresponds to the 'npm start' or 'node src/server.js' script
CMD [ "npm", "start" ]
