# Backend

Reference: [vibe-draw/backend at main · martin226/vibe-draw](https://github.com/martin226/vibe-draw/tree/main/backend)

- [Using Redis — Celery 5.4.0 documentation](https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/redis.html)

## Todo

- [ ] Celery Dashboard
- [ ] Redis Dashboard / CLI guide (interact with the docker container)
- [ ] Celery warning: `CPendingDeprecationWarning: The broker_connection_retry configuration setting will no longer determine whether broker connection retries are made during startup in Celery 6.0 and above. If you wish to retain the existing behavior for retrying connections on startup, you should set broker_connection_retry_on_startup to True.`
- [ ] Introduce scheduling tasks
- [ ] Submit tasks from CLI/Web UI
- [ ] Add more practical examples
  - [daviddwlee84/ML-API-Submit-Template: Show case of submit ML Training tasks from CLI and through API with resource (GPU) management. Using MLFlow, FastAPI, Streamlit, Tap, ...](https://github.com/daviddwlee84/ML-API-Submit-Template) (i.e. replace `pueue` to Celery + Redis)
  - [daviddwlee84/Tap-to-Streamlit-UI: Converter for Python Typed Argument Parser (Tap) to create Streamlit UI and Pydantic Model to create equivalent experience cross CLI, GUI (Web), and API](https://github.com/daviddwlee84/Tap-to-Streamlit-UI)
