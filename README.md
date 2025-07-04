# Agentic RAG System Setup Guide 


## Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Ollama installed on Mac
- Git

## Setup
- Llama3.2:3b 
- Nest js 11.0.7 
- Angular 20.0.0


## Step 1: Install and Setup Ollama with Llama3.2:3b

```bash

# Install Ollama on Mac
brew install ollama

# In another terminal, pull a model (choose one)
ollama pull llama3.2:3b        # Smaller, faster
ollama pull llama3.2:8b        # Better quality
ollama pull mistral:7b         # Alternative option


# For this project pull the llama3.2:3b model
ollama pull llama3.2:3b

# Start Ollama server (runs on localhost:11434 by default)
ollama serve

# Test the model
ollama run llama3.2:3b "Hello, how are you?"

```

## Step 2: Installing node modules backend
```bash
cd agentic-rag-backend
npm install
```

## Step 3: Installing node modules frontend
```bash
cd agentic-rag-frontend
npm install
```


## Step 4: Running the Application

### Start the Backend (in separate terminal):
```bash
cd agentic-rag-backend
npm run start:dev
```

### Start the Frontend (in separate terminal):
```bash
cd agentic-rag-frontend
ng serve
```

### Start Ollama (in separate terminal):
```bash
ollama serve
```

## Step 5: Test Example
Open the browser <a href="http://localhost:4200">http://localhost:4200</a>
You can upload the <code>test-document.json</code> from the test-example folder and ask questions about the document.

#### Example:
<ul>
    <li>What is the salary of John Doe ?</li>
    <li>What are the skills of Jane Smith ?</li>
    <li>What is the total amount of all salaries ?</li>
</ul>
- 