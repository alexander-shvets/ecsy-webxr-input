import { Component, System, Types } from "https://ecsy.io/build/ecsy.module.js"
const { Ref, Boolean } = Types

// export class WebXRButtonComponent extends Component {
//     static schema = {
//         enabled: {type: Boolean},
//         onRequestSession: {type: Ref},
//         onEndSession: {type: Ref},
//     }
// }

export class WebXRSession extends Component {
    static schema = {
        session: {type: Ref},
        isImmersive: {type: Boolean, default: false},
        refSpace: {type: Ref},
    }
}

// export class WebXRFrame extends Component {
//     static schema = {
//         frame: {type: Ref},
//     }
// }

export class WebGLRendererContext extends Component {
    static schema = {value: {type: Ref}}
}

export class XRInput extends Component {
    static schema = {
        viewerPose: {type: Ref},
        controllers: {default: [], type: Types.Array},
    }
}

// export class WebXRInputSource extends Component {
//     static schema = {source: {type: Ref}}
// }

export class WebXRSystem extends System {
    
    init({ onVRSupportRequested, loopFrame}) {
        if(loopFrame) this.loopFrame = loopFrame
        const {world} = this
        world.registerComponent(WebXRSession)
          //.registerComponent(WebXRButtonComponent)
        const {xr} = navigator
        if( xr ){
            xr.isSessionSupported('immersive-vr').then( onVRSupportRequested )
            xr.requestSession('inline').then( session => 
                world.createEntity('inline-session').addComponent(WebXRSession, {session})
            )
        } else console.log("WebXR isn't supported by this browser")
    }

    startVR(onStarted, onEnded, loopFrame){
        if(loopFrame) this.loopFrame = loopFrame
        var entity, session, isImmersive
        return navigator.xr.requestSession(
            'immersive-vr', 
            {requiredFeatures: ['local-floor']}
        ).then( vrSession => {
            isImmersive = true
            session = vrSession
            session.addEventListener('end', onEnded)
            entity = this.world.createEntity('vr-session')
            const refSpaceType = isImmersive ? 'local-floor' : 'viewer'
            return session.requestReferenceSpace(refSpaceType)
        }).then( refSpace => {
            entity.addComponent(WebXRSession, {session, isImmersive, refSpace})
            onStarted && onStarted(session, refSpace)
            console.log('XR refSpace', refSpace)
        }).catch(console.warn)
    }

    static queries = {
        sessions:  {components: [WebXRSession], listen: {added:true, removed:true}},
        glContext: {components: [WebGLRendererContext]},
    }

    // requestAnimationFrame(loopFrame){
    //     if(this.loopFrame !== loopFrame) this.loopFrame = loopFrame
    // }

    execute(){
        const { sessions } = this.queries
        const [glEntity] = this.queries.glContext.results
        const gl = glEntity && glEntity.getComponent(WebGLRendererContext).value

        sessions.added.forEach( async entity => {
            const sessionStore = entity.getComponent(WebXRSession)
            const {session, isImmersive} = sessionStore
            session.addEventListener('end', () => entity.remove() )
            console.log('XR session added to', entity.name, 'isImmersive', isImmersive)
            if( entity.name == 'vr-session' ){
                session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) })

                // const refSpaceType = isImmersive ? 'local-floor' : 'viewer'
                // session.requestReferenceSpace(refSpaceType).then( refSpace => {
                //     sessionStore.refSpace = refSpace
                //     onStarted && onStarted(session, refSpace)
                //     console.log('XR refSpace', refSpace)
                // })
            }
            console.log('XR session started', session)
        })

        console.log(sessions.results)
        sessions.results.forEach( entity => {
            const {session, isImmersive, refSpace} = entity.getComponent(WebXRSession)
            if( isImmersive ){
                 console.log('requesting animation frame', session, refSpace)
                 session.requestAnimationFrame((time, frame) => {
                    console.log(time, 'XRFrame', frame)
                    //TODO:
                    // let refSpace = session.isImmersive ?
                    //     xrImmersiveRefSpace :
                    //     inlineViewerHelper.referenceSpace;
                    const viewerPose = refSpace ? frame.getViewerPose(refSpace) : null
                    const controllers = refSpace ? this.updateInputSources(session, frame, refSpace) : []
                    this.loopFrame(session, viewerPose, controllers)
                    this.world.execute(time)
                })
            }
        })
    }

    updateInputSources({inputSources}, frame, refSpace){
        return inputSources.map( inputSource => {
            const {targetRaySpace, targetRayMode, handedness, gripSpace} = inputSource
            const targetRayPose = frame.getPose(targetRaySpace, refSpace)
            // We may not get a pose back in cases where the input source has lost
            // tracking or does not know where it is relative to the given frame
            // of reference.
            if (!targetRayPose) return null

            const gripPose = gripSpace && frame.getPose(gripSpace, refSpace)

            return {targetRayPose, targetRayMode, gripPose, handedness}
        })
    }
}