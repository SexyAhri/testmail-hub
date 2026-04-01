import { App, Input } from "antd";

interface DeleteOperationNotePromptOptions {
  description: string;
  okText: string;
  title: string;
}

type ModalApi = ReturnType<typeof App.useApp>["modal"];

const DEFAULT_PLACEHOLDER = "可选：记录删除原因、工单号或业务背景";

export async function promptOperationNote(
  modal: ModalApi,
  options: DeleteOperationNotePromptOptions,
) {
  return new Promise<string | null>(resolve => {
    let note = "";
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    modal.confirm({
      title: options.title,
      okText: options.okText,
      cancelText: "取消",
      content: (
        <div style={{ display: "grid", gap: 8 }}>
          <span>{options.description}</span>
          <Input.TextArea
            autoFocus
            autoSize={{ maxRows: 6, minRows: 3 }}
            maxLength={280}
            placeholder={DEFAULT_PLACEHOLDER}
            showCount
            onChange={event => {
              note = event.target.value;
            }}
          />
        </div>
      ),
      onOk: async () => {
        finish(note.trim());
      },
      onCancel: () => {
        finish(null);
      },
      afterClose: () => {
        finish(null);
      },
    });
  });
}

export const promptDeleteOperationNote = promptOperationNote;
