export function createSay(voice, setReplay) {
  return (id) => {
    setReplay([id]);
    return voice.say(id);
  };
}
