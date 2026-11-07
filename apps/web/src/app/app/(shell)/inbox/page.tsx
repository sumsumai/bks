import { Empty } from "@/components/ui";

export default function InboxIndex() {
  return (
    <div className="hidden flex-1 place-items-center lg:grid">
      <Empty icon="chat" title="Select a conversation">Your agent handles routine questions. Anything it escalates is highlighted on the left.</Empty>
    </div>
  );
}
