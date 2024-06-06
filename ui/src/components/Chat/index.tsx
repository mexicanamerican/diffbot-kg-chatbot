import {
  ActionIcon,
  Button,
  Notification,
  Paper,
  Skeleton,
  Textarea,
} from "@mantine/core";
import { IconMoodSmile, IconRobotFace, IconSend2 } from "@tabler/icons-react";
import { RemoteRunnable } from "@langchain/core/runnables/remote";

import styles from "./styles.module.css";
import { ChangeEvent, useState } from "react";
import { globalStore } from "../../global/state";
import { RETRIEVAL_MODES } from "../../global/constants";
import { ChatMessage } from "./interfaces";
import { getChatHistory } from "./utils";
import { RetrievalModeSelector } from "./components/RetrievalModeSelector";
import { useQuery } from "@tanstack/react-query";
import { refreshSchema } from "../../api";

export function Chat() {
  const { retrievalMode } = globalStore();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const refreshSchemaQuery = useQuery({
    queryKey: ["refresh-schema"],
    queryFn: refreshSchema,
    enabled: false,
  });

  const handleSubmit = async () => {
    if (input.trim() === "") return;

    setMessages((prevMessages) => [
      ...prevMessages,
      { sender: "user", text: input },
    ]);

    setInput("");
    setError("");
    setIsGenerating(true);

    const mode = RETRIEVAL_MODES.find(({ name }) => name === retrievalMode);

    if (!mode) {
      throw new Error("Passed invalid retrieval mode.");
    }

    try {
      setMessages((prevMessages) => [
        ...prevMessages,
        { sender: "bot", text: "" },
      ]);

      const remoteChain = new RemoteRunnable({
        url: `/api/${mode.endpoint}`,
      });

      const stream = await remoteChain.streamLog({
        question: input,
        chat_history: getChatHistory(messages, 3),
        mode: mode.name,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let currentOutput: any;

      for await (const chunk of stream) {
        if (!currentOutput) {
          currentOutput = chunk;
        } else {
          currentOutput = currentOutput.concat(chunk);
        }

        setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          const lastMessage = newMessages[newMessages.length - 1];

          const newMessage =
            currentOutput &&
            currentOutput.state &&
            currentOutput.state.final_output
              ? currentOutput.state.final_output
              : "";

          newMessages[newMessages.length - 1] = {
            ...lastMessage,
            text: newMessage,
          };

          return newMessages;
        });
      }

      console.log("currentOutput", currentOutput);
    } catch (error) {
      console.error("Error invoking remote chain:", error);
      setError(`Error invoking remote chain: ${JSON.stringify(error)}`);
    }
    setIsGenerating(false);
  };

  const handleTextareaInputChange = (
    event: ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setInput(event.target.value);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className={styles.chat}>
      <div className={styles.output}>
        <div className={styles.outputText}>
          {messages.map((message, index) => (
            <Paper key={index} mb="xs" p="xs">
              <div className={styles.message}>
                <div className={styles.messageAvatar}>
                  {message.sender === "user" ? (
                    <IconMoodSmile />
                  ) : (
                    <IconRobotFace />
                  )}
                </div>
                <div className={styles.messageText}>
                  {message.text}
                  {isGenerating &&
                    message.sender === "bot" &&
                    index === messages.length - 1 && (
                      <Skeleton
                        height={16}
                        circle
                        className={styles.generatingIndicator}
                      />
                    )}
                </div>
              </div>
            </Paper>
          ))}
          {error && (
            <Notification
              color="red"
              title="Error!"
              withCloseButton={false}
              style={{ boxShadow: "none" }}
            >
              {JSON.stringify(error)}
            </Notification>
          )}
        </div>
      </div>
      <div className={styles.input}>
        <div className={styles.inputTextarea}>
          <Textarea
            size="lg"
            placeholder="How can I help you today?"
            autosize
            minRows={1}
            maxRows={10}
            value={input}
            onKeyDown={handleKeyDown}
            onChange={handleTextareaInputChange}
          />
          <div className={styles.inputAction}>
            <ActionIcon
              variant="filled"
              aria-label="Settings"
              size="lg"
              onClick={handleSubmit}
              color="teal"
            >
              <IconSend2 style={{ width: "70%", height: "70%" }} stroke={1.5} />
            </ActionIcon>
          </div>
        </div>
        <div className={styles.inputOptions}>
          <div className={styles.mode}>
            <RetrievalModeSelector />
          </div>

          {retrievalMode === "text2cypher" && (
            <Button
              size="xs"
              loading={refreshSchemaQuery.isFetching}
              variant="subtle"
              color="teal"
              onClick={() => refreshSchemaQuery.refetch()}
            >
              Refresh schema
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
