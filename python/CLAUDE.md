# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Python project that provides OAuth2 JWT token generation for Google Vertex AI APIs. The project is designed to:

1. Read Google Vertex AI JSON key files from the `geminiJson/` directory
2. Generate OAuth2 JWT tokens using Google's authentication APIs
3. Provide a modular authentication module that can be imported by other programs

## Project Structure

```
.
├── doc.txt                    # Project requirements (in Chinese)
├── geminiJson/               # Directory for Google Vertex AI JSON key files
└── [Python modules to be created]
```

## Key Requirements

Based on `doc.txt`, the project needs to:

- Use Python to read Google Vertex AI JSON key files
- Generate OAuth2 JWT tokens using Google's API documentation
- Create modular code that can be imported as a dependency by other programs
- Store JSON key files in the `geminiJson/` directory

## Development Commands

Since this is a Python project, common commands would include:

```bash
# Install dependencies (once requirements.txt is created)
pip install -r requirements.txt

# Run the main module (to be created)
python -m main

# Run tests (once test suite is created)
python -m pytest

# Format code (if black is added)
black .

# Lint code (if flake8 is added)
flake8 .
```

## Architecture Notes

The project should be structured as:

- **Authentication Module**: Core JWT token generation logic
- **Configuration**: Reading JSON key files from `geminiJson/`
- **API Integration**: Google OAuth2 API calls
- **Error Handling**: Proper exception handling for authentication failures

## Important Considerations

- The JSON key files in `geminiJson/` are sensitive credentials
- The module should handle token refresh automatically
- Code should be modular for easy import by other programs
- Follow Google's latest OAuth2 API documentation for implementation