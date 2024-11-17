# type: ignore
import asyncio
import base64
import logging

from typing import Any, Callable, Dict, List, Optional, cast

import numpy as np
from dotenv import load_dotenv
from litellm import acompletion
from pydantic import BaseModel, Field
from sklearn.metrics.pairwise import cosine_similarity
from tenacity import AsyncRetrying, stop_after_attempt, wait_random_exponential

load_dotenv()


EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536


class ModelInfo(BaseModel):
    name: str
    max_tokens: int = Field(
        default=1024,
        ge=1,
        le=65536,
        description="Maximum number of tokens the model can generate",
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Temperature for randomness, between 0.0 and 1.0",
    )
    top_p: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Top-p sampling value, between 0.0 and 1.0",
    )


class LLMModelRegistry:
    GPT_4O_MINI = ModelInfo(
        name="gpt-4o-mini",
        max_tokens=16384,
        temperature=0.7,
        top_p=1.0,
    )
    GPT_4O = ModelInfo(
        name="gpt-4o",
        max_tokens=16384,
        temperature=0.7,
        top_p=1.0,
    )
    O1_PREVIEW = ModelInfo(
        name="o1-preview",
        max_tokens=32768,
        temperature=0.7,
        top_p=1.0,
    )
    O1_MINI = ModelInfo(
        name="o1-mini",
        max_tokens=65536,
        temperature=0.7,
        top_p=1.0,
    )
    GPT_4_TURBO = ModelInfo(
        name="gpt-4-turbo",
        max_tokens=16384,
        temperature=0.7,
        top_p=1.0,
    )
    CHATGPT_4O_LATEST = ModelInfo(
        name="chatgpt-4o-latest",
        max_tokens=16384,
        temperature=0.7,
        top_p=1.0,
    )

    @classmethod
    def get_model_info(cls, model_name: str) -> Optional[ModelInfo]:
        return getattr(cls, model_name.upper(), None)


def create_messages(
    system_message: str,
    user_message: str,
    few_shot_examples: Optional[List[Dict[str, str]]] = None,
    history: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, str]]:
    messages = [{"role": "system", "content": system_message}]
    if few_shot_examples:
        for example in few_shot_examples:
            messages.append({"role": "user", "content": example["input"]})
            messages.append({"role": "assistant", "content": example["output"]})
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})
    return messages


def create_messages_with_images(
    system_message: str,
    base64_image: str,
    user_message: str = "",
    few_shot_examples: Optional[List[Dict]] = None,
    history: Optional[List[Dict]] = None,
) -> List[Dict[str, str]]:
    messages = [
        {"role": "system", "content": [{"type": "text", "text": system_message}]}
    ]
    if few_shot_examples:
        for example in few_shot_examples:
            messages.append(
                {
                    "role": "user",
                    "content": [{"type": "text", "text": example["input"]}],
                }
            )
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": example["img"]}}
                    ],
                }
            )
            messages.append(
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": example["output"]}],
                }
            )
    if history:
        messages.extend(history)
    messages.append(
        {
            "role": "user",
            "content": [{"type": "image_url", "image_url": {"url": base64_image}}],
        }
    )
    if user_message:
        messages[-1]["content"].append({"type": "text", "text": user_message})
    return messages


def async_retry(*dargs, **dkwargs):
    def decorator(f: Callable) -> Callable:
        r = AsyncRetrying(*dargs, **dkwargs)

        async def wrapped_f(*args, **kwargs):
            async for attempt in r:
                with attempt:
                    return await f(*args, **kwargs)

        return wrapped_f

    return decorator


@async_retry(wait=wait_random_exponential(min=30, max=120), stop=stop_after_attempt(20))
async def completion_with_backoff(**kwargs) -> str:
    try:
        response = await acompletion(**kwargs)
        return response.choices[0].message.content
    except Exception as e:
        logging.error(e)
        raise e


@async_retry(wait=wait_random_exponential(min=30, max=300), stop=stop_after_attempt(30))
async def get_embedding(
    text: str, model: str = EMBEDDING_MODEL, dimensions: int = EMBEDDING_DIMENSIONS
) -> List[float]:
    try:
        response = await client.embeddings.create(
            input=text, model=model, dimensions=dimensions
        )
        return response.data[0].embedding
    except Exception as e:
        logging.error(e)
        raise e


async def generate_text(
    messages: List[Dict[str, str]],
    model_name: str,
    temperature: float = 0.5,
    json_mode: bool = False,
    max_tokens: int = 100000,
) -> str:
    kwargs = {
        "model": model_name,
        "max_tokens": 1000,
        "messages": messages,
        "temperature": temperature,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    response = await completion_with_backoff(**kwargs)
    return cast(str, response)


def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")


async def compute_embeddings(
    docs: List[Any],
    embedding_dimensions: int = EMBEDDING_DIMENSIONS,
    text_extractor: Optional[Callable[[Any], str]] = None,
) -> np.ndarray:
    if text_extractor:
        texts = [text_extractor(doc) for doc in docs]
    else:
        if all(isinstance(doc, str) for doc in docs):
            texts = docs
        else:
            logging.error(
                "Documents must be strings or you must provide a text_extractor function."
            )
            return np.array([])
    embeddings = []
    for text in texts:
        try:
            embedding = await get_embedding(text, dimensions=embedding_dimensions)
            embeddings.append(embedding)
        except Exception as e:
            logging.error(f"Error obtaining embedding for text: {e}")
            embeddings.append(
                [0] * embedding_dimensions
            )  # Placeholder for failed embeddings
    return np.array(embeddings)


async def find_top_k_similar(
    old_docs: List[Any],
    new_docs: List[Any],
    k: int = 5,
    text_extractor: Optional[Callable[[Any], str]] = None,
    id_extractor: Optional[Callable[[Any], Any]] = None,
) -> Dict[Any, List[Dict[str, Any]]]:
    old_embeddings = await compute_embeddings(old_docs, text_extractor=text_extractor)
    new_embeddings = await compute_embeddings(new_docs, text_extractor=text_extractor)

    similarity_matrix = cosine_similarity(old_embeddings, new_embeddings)
    top_k_indices = np.argsort(-similarity_matrix, axis=1)[:, :k]

    top_k_similar_docs = {}
    for i, old_doc in enumerate(old_docs):
        similar_docs = [
            {
                "document": new_docs[idx],
                "similarity_score": similarity_matrix[i][idx],
            }
            for idx in top_k_indices[i]
        ]
        key = id_extractor(old_doc) if id_extractor else i
        top_k_similar_docs[key] = similar_docs
    return top_k_similar_docs
