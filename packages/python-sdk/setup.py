from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="powerlobster-webhook",
    version="1.0.0",
    author="PowerLobster HQ",
    author_email="support@powerlobster.com",
    description="Official Python SDK for PowerLobster Webhook Relay",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/powerlobster-hq/webhook-relay",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    python_requires=">=3.8",
    install_requires=[
        "websockets>=11.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
            "pytest-asyncio>=0.21",
            "black>=23.0",
            "mypy>=1.0",
            "pylint>=2.17",
        ]
    },
    package_data={
        "powerlobster_webhook": ["py.typed"],
    },
)
