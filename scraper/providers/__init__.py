"""Provider registry: name -> fetch function. Add a new provider here."""
from . import anthropic, seeds

PROVIDERS = {
    "anthropic": anthropic.fetch_models,
    "openai": seeds.fetch_openai,
    "google": seeds.fetch_google,
    "groq": seeds.fetch_groq,
    "mistral": seeds.fetch_mistral,
}
